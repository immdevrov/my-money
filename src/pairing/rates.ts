export type Rate = { date: string; currency: string; rateScaled: number };

export function buildRateTable(rates: Rate[]): Rate[] {
  const byKey = new Map<string, Rate>();

  for (const rate of rates) {
    byKey.set(`${rate.date}|${rate.currency}`, rate);
  }

  return [...byKey.values()].sort((a, b) =>
    a.date === b.date ? (a.currency < b.currency ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
}

const MS_PER_DAY = 86_400_000;

function daysSinceEpoch(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function rateFor(table: Rate[], currency: string, date: string): Rate | null {
  const month = date.slice(0, 7);
  let before: Rate | null = null;
  let after: Rate | null = null;

  for (const rate of table) {
    if (rate.currency !== currency) continue;
    if (rate.date <= date) {
      before = rate;
    }
    if (rate.date > date && after === null && rate.date.slice(0, 7) === month) {
      after = rate;
    }
  }

  if (before === null) return after;
  if (after === null) return before;

  const beforeDistance = daysSinceEpoch(date) - daysSinceEpoch(before.date);
  const afterDistance = daysSinceEpoch(after.date) - daysSinceEpoch(date);

  return afterDistance < beforeDistance ? after : before;
}
