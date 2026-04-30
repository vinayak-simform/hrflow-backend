import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectLeaveDto {
  @ApiProperty({
    description: 'Mandatory reason for rejection. Must be at least 10 characters.',
    example: 'Team is understaffed during this period. Please reschedule.',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Rejection reason must be at least 10 characters' })
  comments!: string;
}
