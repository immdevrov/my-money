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

export function rateFor(table: Rate[], currency: string, onOrBefore: string): Rate | null {
  let found: Rate | null = null;

  for (const rate of table) {
    if (rate.currency !== currency) continue;
    if (rate.date > onOrBefore) break;
    found = rate;
  }

  return found;
}
