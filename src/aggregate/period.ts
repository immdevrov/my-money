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
