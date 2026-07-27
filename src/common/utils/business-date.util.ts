export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const IST_OFFSET_MINUTES = 5 * 60 + 30;

export interface BusinessDateRange {
  from: Date;
  toExclusive: Date;
  fromDate: string;
  toDate: string;
}

/**
 * Converts a YYYY-MM-DD calendar day in the business timezone to an instant.
 * The application currently operates in India, which does not observe DST.
 */
export function businessDayStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    Date.UTC(year, month - 1, day) - IST_OFFSET_MINUTES * 60 * 1000,
  );
}

export function formatBusinessDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function inclusiveBusinessDateRange(
  fromDate: string,
  toDate: string,
): BusinessDateRange {
  const from = businessDayStart(fromDate);
  const toExclusive = new Date(businessDayStart(toDate));
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive, fromDate, toDate };
}

export function currentMonthBusinessRange(now = new Date()): BusinessDateRange {
  const currentDate = formatBusinessDate(now);
  const [year, month] = currentDate.split('-').map(Number);
  return monthBusinessRange(year, month);
}

export function previousMonthBusinessRange(
  now = new Date(),
): BusinessDateRange {
  const currentDate = formatBusinessDate(now);
  const [year, month] = currentDate.split('-').map(Number);
  return monthBusinessRange(
    month === 1 ? year - 1 : year,
    month === 1 ? 12 : month - 1,
  );
}

function monthBusinessRange(year: number, month: number): BusinessDateRange {
  const fromDate = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthDate = `${nextYear.toString().padStart(4, '0')}-${nextMonth
    .toString()
    .padStart(2, '0')}-01`;
  const from = businessDayStart(fromDate);
  const toExclusive = businessDayStart(nextMonthDate);
  const lastDay = new Date(toExclusive);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return {
    from,
    toExclusive,
    fromDate,
    toDate: formatBusinessDate(lastDay),
  };
}
