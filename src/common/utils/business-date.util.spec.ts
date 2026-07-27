import {
  inclusiveBusinessDateRange,
  previousMonthBusinessRange,
} from './business-date.util';

describe('business date ranges', () => {
  it('handles the January to December year boundary in India time', () => {
    const range = previousMonthBusinessRange(
      new Date('2026-01-15T12:00:00.000Z'),
    );

    expect(range.fromDate).toBe('2025-12-01');
    expect(range.toDate).toBe('2025-12-31');
  });

  it('makes an inclusive selected end date exclusive internally', () => {
    const range = inclusiveBusinessDateRange('2026-07-01', '2026-07-31');

    expect(range.from.toISOString()).toBe('2026-06-30T18:30:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-07-31T18:30:00.000Z');
  });
});
