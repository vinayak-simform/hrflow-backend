import { BadRequestException, Injectable } from '@nestjs/common';
import { InMemoryStore } from '../../store/in-memory.store';

@Injectable()
export class CalendarService {
  constructor(private readonly store: InMemoryStore) {}

  /**
   * Calculates the number of working days between two dates (inclusive).
   * Excludes: Saturdays, Sundays, and any configured public holidays.
   *
   * @param fromDate - Start date in YYYY-MM-DD format
   * @param toDate   - End date in YYYY-MM-DD format
   * @returns Number of working days (>= 0)
   */
  calculateWorkingDays(fromDate: string, toDate: string): number {
    if (fromDate > toDate) {
      throw new BadRequestException('fromDate cannot be after toDate');
    }

    // Build a Set of public holiday strings for O(1) lookup
    const holidaySet = new Set(this.store.publicHolidays.map((h) => h.date));

    let workingDays = 0;
    const current = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday
      const dateStr = current.toISOString().split('T')[0];

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidaySet.has(dateStr);

      if (!isWeekend && !isHoliday) {
        workingDays++;
      }

      current.setDate(current.getDate() + 1);
    }

    return workingDays;
  }
}
