import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveBalanceModule } from '../leave-balance/leave-balance.module';
import { LeaveTypesModule } from '../leave-types/leave-types.module';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';

@Module({
  imports: [
    EmployeesModule,      // EmployeesService — resolve user → employee, managerId checks
    LeaveBalanceModule,   // LeaveBalanceService — check, deduct, restore balance
    LeaveTypesModule,     // LeaveTypesService — validate leaveTypeId exists & is active
    CalendarModule,       // CalendarService — working days calculation
  ],
  providers: [LeaveRequestsService],
  controllers: [LeaveRequestsController],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
