import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveApproval } from '../../shared/interfaces/leave-approval.interface';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../../shared/interfaces/leave-request.interface';
import { User } from '../../shared/interfaces/user.interface';
import { InMemoryStore } from '../../store/in-memory.store';
import { CalendarService } from '../calendar/calendar.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveBalanceService } from '../leave-balance/leave-balance.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { GetAllLeavesQueryDto } from './dto/get-all-leaves-query.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly employeesService: EmployeesService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveTypesService: LeaveTypesService,
    private readonly calendarService: CalendarService,
  ) {}

  // ── Submit a new leave request ─────────────────────────────────────────
  create(currentUser: User, dto: CreateLeaveRequestDto): LeaveRequest {
    // 1. Resolve the employee record for the authenticated user
    const employee = this.employeesService.getByUserId(currentUser.id);
    if (!employee || !employee.isActive) {
      throw new ForbiddenException(
        'No active employee record found for this account. Please contact HR.',
      );
    }

    // 2. Validate leave type exists and is active
    const leaveType = this.leaveTypesService.findOne(dto.leaveTypeId);
    if (!leaveType.isActive) {
      throw new BadRequestException(
        `Leave type '${leaveType.name}' is currently inactive and cannot be used.`,
      );
    }

    // 3. Validate date range — fromDate must be <= toDate and not in the past
    const today = new Date().toISOString().split('T')[0];
    if (dto.fromDate > dto.toDate) {
      throw new BadRequestException(
        `fromDate (${dto.fromDate}) cannot be after toDate (${dto.toDate}).`,
      );
    }
    if (dto.fromDate < today) {
      throw new BadRequestException(
        'Leave requests cannot be submitted for past dates.',
      );
    }

    // 4. Calculate working days (excludes weekends + public holidays)
    const workingDays = this.calendarService.calculateWorkingDays(
      dto.fromDate,
      dto.toDate,
    );
    if (workingDays === 0) {
      throw new BadRequestException(
        'The selected date range contains no working days. All days fall on weekends or public holidays.',
      );
    }

    // 5. Check sufficient leave balance exists (balance deduction happens on APPROVAL, not here)
    const year = new Date(dto.fromDate).getFullYear();
    const balance = this.leaveBalanceService.getBalance(
      employee.id,
      dto.leaveTypeId,
      year,
    );
    if (!balance) {
      throw new BadRequestException(
        `No leave balance found for this leave type in ${year}. Please contact HR to allocate your balance.`,
      );
    }
    if (balance.remaining < workingDays) {
      throw new BadRequestException(
        `Insufficient leave balance. Requested: ${workingDays} working day(s), Available: ${balance.remaining} day(s).`,
      );
    }

    // 6. Check for overlap with existing APPROVED leaves only
    this.assertNoOverlap(employee.id, dto.fromDate, dto.toDate);

    // 7. Persist and return
    const request: LeaveRequest = {
      id: this.store.generateId(),
      employeeId: employee.id,
      leaveTypeId: dto.leaveTypeId,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      workingDays,
      reason: dto.reason,
      status: 'pending',
      createdAt: this.store.now(),
      updatedAt: this.store.now(),
    };
    this.store.leaveRequests.push(request);
    return request;
  }

  // ── HR Admin: submit a leave request on behalf of an employee ──────────
  createOnBehalf(
    targetEmployeeId: string,
    dto: CreateLeaveRequestDto,
  ): LeaveRequest {
    const employee = this.employeesService.findOne(targetEmployeeId);
    if (!employee.isActive) {
      throw new BadRequestException(
        `Employee ${targetEmployeeId} is inactive. Cannot submit leave on their behalf.`,
      );
    }

    const leaveType = this.leaveTypesService.findOne(dto.leaveTypeId);
    if (!leaveType.isActive) {
      throw new BadRequestException(
        `Leave type '${leaveType.name}' is currently inactive.`,
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (dto.fromDate > dto.toDate) {
      throw new BadRequestException(
        `fromDate (${dto.fromDate}) cannot be after toDate (${dto.toDate}).`,
      );
    }
    if (dto.fromDate < today) {
      throw new BadRequestException(
        'Leave requests cannot be submitted for past dates.',
      );
    }

    const workingDays = this.calendarService.calculateWorkingDays(
      dto.fromDate,
      dto.toDate,
    );
    if (workingDays === 0) {
      throw new BadRequestException(
        'The selected date range contains no working days.',
      );
    }

    const year = new Date(dto.fromDate).getFullYear();
    const balance = this.leaveBalanceService.getBalance(
      employee.id,
      dto.leaveTypeId,
      year,
    );
    if (!balance) {
      throw new BadRequestException(
        `No leave balance found for employee in ${year}. Please allocate balance first.`,
      );
    }
    if (balance.remaining < workingDays) {
      throw new BadRequestException(
        `Insufficient leave balance for this employee. Requested: ${workingDays} day(s), Available: ${balance.remaining} day(s).`,
      );
    }

    this.assertNoOverlap(employee.id, dto.fromDate, dto.toDate);

    const request: LeaveRequest = {
      id: this.store.generateId(),
      employeeId: employee.id,
      leaveTypeId: dto.leaveTypeId,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      workingDays,
      reason: dto.reason,
      status: 'pending',
      createdAt: this.store.now(),
      updatedAt: this.store.now(),
    };
    this.store.leaveRequests.push(request);
    return request;
  }

  // ── Retrieve own leave history (any authenticated user) ────────────────
  findMyLeaves(currentUser: User): LeaveRequest[] {
    const employee = this.employeesService.getByUserId(currentUser.id);
    if (!employee) return [];

    return this.store.leaveRequests
      .filter((r) => r.employeeId === employee.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── Retrieve team leave requests (manager sees direct reports only) ─────
  findTeamLeaves(
    currentUser: User,
    status?: LeaveRequestStatus,
  ): LeaveRequest[] {
    const managerEmployee = this.employeesService.getByUserId(currentUser.id);

    let results: LeaveRequest[];

    if (currentUser.role === 'hr_admin') {
      // HR admin sees all requests across the company
      results = [...this.store.leaveRequests];
    } else {
      if (!managerEmployee) return [];

      // Manager sees only their direct reports
      const directReportIds = this.store.employees
        .filter((e) => e.managerId === managerEmployee.id && e.isActive)
        .map((e) => e.id);

      results = this.store.leaveRequests.filter((r) =>
        directReportIds.includes(r.employeeId),
      );
    }

    if (status) {
      results = results.filter((r) => r.status === status);
    }

    return results.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // ── Retrieve all requests with filters (HR Admin only) ─────────────────
  findAll(query: GetAllLeavesQueryDto): LeaveRequest[] {
    let results = [...this.store.leaveRequests];

    if (query.status) {
      results = results.filter((r) => r.status === query.status);
    }
    if (query.employeeId) {
      results = results.filter((r) => r.employeeId === query.employeeId);
    }
    if (query.leaveTypeId) {
      results = results.filter((r) => r.leaveTypeId === query.leaveTypeId);
    }
    if (query.fromDate) {
      results = results.filter((r) => r.fromDate >= query.fromDate!);
    }
    if (query.toDate) {
      results = results.filter((r) => r.toDate <= query.toDate!);
    }
    if (query.departmentId) {
      const employeeIdsInDept = this.store.employees
        .filter((e) => e.departmentId === query.departmentId)
        .map((e) => e.id);
      results = results.filter((r) =>
        employeeIdsInDept.includes(r.employeeId),
      );
    }

    return results.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // ── Approve a leave request ────────────────────────────────────────────
  approve(currentUser: User, requestId: string): LeaveRequest {
    const request = this.findOneOrFail(requestId);
    const approverEmployee = this.employeesService.getByUserId(currentUser.id);
    if (!approverEmployee) {
      throw new ForbiddenException('No employee record found for this account.');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Only pending requests can be approved. Current status: '${request.status}'.`,
      );
    }

    // Prevent self-approval
    if (request.employeeId === approverEmployee.id) {
      throw new ForbiddenException(
        'You cannot approve your own leave request.',
      );
    }

    // Manager scope: can only approve direct reports
    if (currentUser.role === 'manager') {
      const requestingEmployee = this.store.employees.find(
        (e) => e.id === request.employeeId,
      );
      if (
        !requestingEmployee ||
        requestingEmployee.managerId !== approverEmployee.id
      ) {
        throw new ForbiddenException(
          'You can only approve leave requests for your own direct reports.',
        );
      }
    }

    // Deduct balance on approval
    const year = new Date(request.fromDate).getFullYear();
    this.leaveBalanceService.deduct(
      request.employeeId,
      request.leaveTypeId,
      request.workingDays,
      year,
    );

    request.status = 'approved';
    request.updatedAt = this.store.now();

    // Persist audit trail
    this.createApprovalAudit(requestId, approverEmployee.id, 'approved', '');

    return request;
  }

  // ── Reject a leave request ─────────────────────────────────────────────
  reject(
    currentUser: User,
    requestId: string,
    dto: RejectLeaveDto,
  ): LeaveRequest {
    const request = this.findOneOrFail(requestId);
    const approverEmployee = this.employeesService.getByUserId(currentUser.id);
    if (!approverEmployee) {
      throw new ForbiddenException('No employee record found for this account.');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Only pending requests can be rejected. Current status: '${request.status}'.`,
      );
    }

    // Prevent self-rejection
    if (request.employeeId === approverEmployee.id) {
      throw new ForbiddenException(
        'You cannot reject your own leave request.',
      );
    }

    // Manager scope: can only reject direct reports
    if (currentUser.role === 'manager') {
      const requestingEmployee = this.store.employees.find(
        (e) => e.id === request.employeeId,
      );
      if (
        !requestingEmployee ||
        requestingEmployee.managerId !== approverEmployee.id
      ) {
        throw new ForbiddenException(
          'You can only reject leave requests for your own direct reports.',
        );
      }
    }

    request.status = 'rejected';
    request.updatedAt = this.store.now();

    // Persist audit trail with mandatory rejection reason
    this.createApprovalAudit(
      requestId,
      approverEmployee.id,
      'rejected',
      dto.comments,
    );

    return request;
  }

  // ── Cancel a leave request ─────────────────────────────────────────────
  cancel(currentUser: User, requestId: string): LeaveRequest {
    const request = this.findOneOrFail(requestId);
    const currentEmployee = this.employeesService.getByUserId(currentUser.id);

    // Employees can only cancel their own; HR Admin can cancel any
    if (currentUser.role !== 'hr_admin') {
      if (!currentEmployee || request.employeeId !== currentEmployee.id) {
        throw new ForbiddenException(
          'You can only cancel your own leave requests.',
        );
      }
    }

    if (request.status !== 'pending' && request.status !== 'approved') {
      throw new BadRequestException(
        `Only pending or approved requests can be cancelled. Current status: '${request.status}'.`,
      );
    }

    // If the request was approved, restore the deducted balance
    if (request.status === 'approved') {
      const year = new Date(request.fromDate).getFullYear();
      this.leaveBalanceService.restore(
        request.employeeId,
        request.leaveTypeId,
        request.workingDays,
        year,
      );
    }

    request.status = 'cancelled';
    request.updatedAt = this.store.now();

    return request;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private findOneOrFail(id: string): LeaveRequest {
    const request = this.store.leaveRequests.find((r) => r.id === id);
    if (!request) {
      throw new NotFoundException(`Leave request '${id}' not found.`);
    }
    return request;
  }

  /**
   * Throws ConflictException if the employee already has an APPROVED leave
   * that overlaps with the given date range.
   * Uses inclusive overlap formula: (from1 <= to2) && (from2 <= to1)
   */
  private assertNoOverlap(
    employeeId: string,
    fromDate: string,
    toDate: string,
    excludeRequestId?: string,
  ): void {
    const overlap = this.store.leaveRequests.find(
      (r) =>
        r.employeeId === employeeId &&
        r.status === 'approved' &&
        r.id !== excludeRequestId &&
        r.fromDate <= toDate &&
        r.toDate >= fromDate,
    );

    if (overlap) {
      throw new ConflictException(
        `Leave dates overlap with an existing approved request (${overlap.fromDate} → ${overlap.toDate}). Please choose different dates.`,
      );
    }
  }

  /**
   * Persists an immutable approval/rejection audit record.
   */
  private createApprovalAudit(
    leaveRequestId: string,
    approverEmployeeId: string,
    action: 'approved' | 'rejected',
    comments: string,
  ): void {
    const audit: LeaveApproval = {
      id: this.store.generateId(),
      leaveRequestId,
      approverEmployeeId,
      action,
      comments,
      actionDate: this.store.now(),
    };
    this.store.leaveApprovals.push(audit);
  }
}
