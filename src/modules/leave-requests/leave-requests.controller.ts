import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { User } from '../../shared/interfaces/user.interface';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { GetAllLeavesQueryDto } from './dto/get-all-leaves-query.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { LeaveRequestsService } from './leave-requests.service';

@ApiTags('Leave Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  // ── POST /leave-requests ─────────────────────────────────────────────
  @Post()
  @ApiOperation({
    summary: 'Submit a leave request',
    description:
      'Submits a new leave request for the authenticated user. ' +
      'Working days are auto-calculated (weekends and public holidays excluded). ' +
      'Balance is NOT deducted at this stage — only upon manager/HR approval.',
  })
  @ApiResponse({ status: 201, description: 'Leave request submitted successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error — bad dates, no working days, insufficient balance, etc.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT.' })
  @ApiResponse({ status: 409, description: 'Conflict — dates overlap with an existing approved leave.' })
  create(
    @CurrentUser() currentUser: User,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveRequestsService.create(currentUser, dto);
  }

  // ── POST /leave-requests/on-behalf/:employeeId ───────────────────────
  @Post('on-behalf/:employeeId')
  @Roles('hr_admin')
  @ApiOperation({
    summary: 'Submit a leave request on behalf of an employee (HR Admin only)',
    description:
      'Allows HR Admin to submit a leave request for any active employee ' +
      '(e.g. when an employee goes on sick leave unexpectedly).',
  })
  @ApiParam({ name: 'employeeId', description: 'Target employee UUID' })
  @ApiResponse({ status: 201, description: 'Leave request submitted on behalf of employee.' })
  @ApiResponse({ status: 400, description: 'Validation error or insufficient balance.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires hr_admin role.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  @ApiResponse({ status: 409, description: 'Conflict — dates overlap with an existing approved leave.' })
  createOnBehalf(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveRequestsService.createOnBehalf(employeeId, dto);
  }

  // ── GET /leave-requests/my ───────────────────────────────────────────
  @Get('my')
  @ApiOperation({
    summary: 'Get own leave history',
    description:
      'Returns all leave requests submitted by the authenticated user, sorted by most recent first.',
  })
  @ApiResponse({ status: 200, description: 'List of own leave requests.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findMyLeaves(@CurrentUser() currentUser: User) {
    return this.leaveRequestsService.findMyLeaves(currentUser);
  }

  // ── GET /leave-requests/team ─────────────────────────────────────────
  @Get('team')
  @Roles('manager', 'hr_admin')
  @ApiOperation({
    summary: 'Get team leave requests',
    description:
      'Managers see leave requests for their direct reports only. ' +
      'HR Admin sees all requests across the company. ' +
      'Optionally filter by status.',
  })
  @ApiResponse({ status: 200, description: 'List of team leave requests.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires manager or hr_admin role.' })
  findTeamLeaves(
    @CurrentUser() currentUser: User,
    @Query('status') status?: string,
  ) {
    const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'] as const;
    type Status = (typeof validStatuses)[number];
    const typedStatus = validStatuses.includes(status as Status)
      ? (status as Status)
      : undefined;
    return this.leaveRequestsService.findTeamLeaves(currentUser, typedStatus);
  }

  // ── GET /leave-requests ──────────────────────────────────────────────
  @Get()
  @Roles('hr_admin')
  @ApiOperation({
    summary: 'Get all leave requests with filters (HR Admin only)',
    description:
      'Returns all leave requests across the company. ' +
      'Supports optional filters: status, employeeId, leaveTypeId, fromDate, toDate, departmentId.',
  })
  @ApiResponse({ status: 200, description: 'Filtered list of all leave requests.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires hr_admin role.' })
  findAll(@Query() query: GetAllLeavesQueryDto) {
    return this.leaveRequestsService.findAll(query);
  }

  // ── PUT /leave-requests/:id/approve ──────────────────────────────────
  @Put(':id/approve')
  @Roles('manager', 'hr_admin')
  @ApiOperation({
    summary: 'Approve a leave request',
    description:
      'Managers can only approve requests from their direct reports. ' +
      'HR Admin can approve any request. ' +
      'Balance is deducted from the employee\'s leave balance upon approval. ' +
      'Self-approval is not permitted.',
  })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request approved. Balance deducted.' })
  @ApiResponse({ status: 400, description: 'Request is not in pending status.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden — self-approval or outside manager scope.' })
  @ApiResponse({ status: 404, description: 'Leave request not found.' })
  approve(@CurrentUser() currentUser: User, @Param('id') id: string) {
    return this.leaveRequestsService.approve(currentUser, id);
  }

  // ── PUT /leave-requests/:id/reject ────────────────────────────────────
  @Put(':id/reject')
  @Roles('manager', 'hr_admin')
  @ApiOperation({
    summary: 'Reject a leave request',
    description:
      'Managers can only reject requests from their direct reports. ' +
      'HR Admin can reject any request. ' +
      'A mandatory rejection reason (comments) must be provided. ' +
      'No balance changes occur on rejection.',
  })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request rejected with reason recorded.' })
  @ApiResponse({ status: 400, description: 'Request is not pending, or comments are missing/too short.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden — self-rejection or outside manager scope.' })
  @ApiResponse({ status: 404, description: 'Leave request not found.' })
  reject(
    @CurrentUser() currentUser: User,
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
  ) {
    return this.leaveRequestsService.reject(currentUser, id, dto);
  }

  // ── PUT /leave-requests/:id/cancel ────────────────────────────────────
  @Put(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a leave request',
    description:
      'Employees can cancel their own pending or approved requests. ' +
      'HR Admin can cancel any request. ' +
      'If an approved request is cancelled, the balance is fully restored.',
  })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request cancelled. Balance restored if previously approved.' })
  @ApiResponse({ status: 400, description: 'Request is already rejected or cancelled.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden — cannot cancel another employee\'s request.' })
  @ApiResponse({ status: 404, description: 'Leave request not found.' })
  cancel(@CurrentUser() currentUser: User, @Param('id') id: string) {
    return this.leaveRequestsService.cancel(currentUser, id);
  }
}
