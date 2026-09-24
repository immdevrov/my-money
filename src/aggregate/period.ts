import type { Transaction } from '../domain/types';

export type PeriodOption = { value: string; label: string };

function quarterOf(effectiveDate: string): string {
  const month = Number(effectiveDate.slice(5, 7));
  return `Q${Math.ceil(month / 3)}`;
}

function distinctSortedDescending(values: string[]): string[] {
  return [...new Set(values)].sort().reverse();
}

function toOptions(values: string[], toLabel: (value: string) => string): PeriodOption[] {
  return distinctSortedDescending(values).map((value) => ({ value, label: toLabel(value) }));
}

export function periodOptions(effectiveDates: string[]): {
  years: PeriodOption[];
  quarters: PeriodOption[];
  months: PeriodOption[];
} {
  return {
    years: toOptions(
      effectiveDates.map((date) => date.slice(0, 4)),
      (value) => value,
    ),
    quarters: toOptions(
      effectiveDates.map((date) => `${date.slice(0, 4)}-${quarterOf(date)}`),
      (value) => value.replace('-Q', ' Q'),
    ),
    months: toOptions(
      effectiveDates.map((date) => date.slice(0, 7)),
      (value) => value,
    ),
  };
}

export function inPeriod(effectiveDate: string, period: string): boolean {
  if (period === '') return true;
  if (period.includes('-Q')) {
    const [year, quarter] = period.split('-Q');
    return effectiveDate.slice(0, 4) === year && quarterOf(effectiveDate) === `Q${quarter}`;
  }
  if (period.length === 4) return effectiveDate.slice(0, 4) === period;
  return effectiveDate.slice(0, 7) === period;
}

export type PeriodType = 'month' | 'quarter' | 'year';

export function periodOf(date: string, type: PeriodType): string {
  if (type === 'year') return date.slice(0, 4);
  if (type === 'quarter') return `${date.slice(0, 4)}-${quarterOf(date)}`;
  return date.slice(0, 7);
}

export function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  if (period.length === 4) return String(year - 1);

  if (period.includes('-Q')) {
    const quarter = Number(period.slice(6));
    return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
  }

  const month = Number(period.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function periodsInSpan(earliest: string, today: string, type: PeriodType): string[] {
  const first = periodOf(earliest, type);
  const periods: string[] = [];

  let period = periodOf(today, type);
  periods.push(period);
  while (period > first) {
    period = previousPeriod(period);
    periods.push(period);
  }

  return periods;
}

export function dashboardPeriods(
  rows: Transaction[],
  today: string,
  type: PeriodType,
): { span: string[]; current: string; defaultPeriod: string } {
  const earliest = rows.reduce(
    (min, row) => (row.effectiveDate < min ? row.effectiveDate : min),
    today,
  );
  const span = periodsInSpan(earliest, today, type);
  const current = periodOf(today, type);
  const defaultPeriod = span[1] ?? current;
  return { span, current, defaultPeriod };
}

export function periodLabel(period: string): string {
  return period.replace('-Q', ' Q');
}

export function isPeriod(value: string): boolean {
  return /^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$/.test(value);
}

export function localToday(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
