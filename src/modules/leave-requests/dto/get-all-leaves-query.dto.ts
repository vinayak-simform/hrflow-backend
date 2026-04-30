import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { LeaveRequestStatus } from '../../../shared/interfaces/leave-request.interface';

const VALID_STATUSES: LeaveRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

export class GetAllLeavesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by request status',
    enum: VALID_STATUSES,
    example: 'pending',
  })
  @IsOptional()
  @IsIn(VALID_STATUSES, { message: `status must be one of: ${VALID_STATUSES.join(', ')}` })
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({
    description: 'Filter by employee ID',
    example: 'uuid-of-employee',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by leave type ID',
    example: 'uuid-of-leave-type',
  })
  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  @ApiPropertyOptional({
    description: 'Filter requests starting on or after this date (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter requests ending on or before this date (YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by department ID',
    example: 'uuid-of-department',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
