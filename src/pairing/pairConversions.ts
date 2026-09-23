export type ConversionRow = {
  id: string;
  postingDate: string;
  currency: string;
  amountMinor: number;
  conversionRateScaled: number | null;
};

export type ConversionPair = { pairId: string; gelId: string; foreignId: string };

export type PairingResult = { pairs: ConversionPair[]; unpaired: string[] };

const BASE_CURRENCY = 'GEL';

function groupKey(row: ConversionRow): string {
  return `${row.postingDate}|${row.conversionRateScaled}`;
}

export function pairConversions(rows: ConversionRow[]): PairingResult {
  const groups = new Map<string, ConversionRow[]>();
  const unpaired: string[] = [];

  for (const row of rows) {
    if (row.conversionRateScaled === null) {
      unpaired.push(row.id);
      continue;
    }
    const key = groupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const pairs: ConversionPair[] = [];

  for (const [key, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const byId = [...group].sort((a, b) => (a.id < b.id ? -1 : 1));
    const base = byId.filter((row) => row.currency === BASE_CURRENCY);
    const foreign = byId.filter((row) => row.currency !== BASE_CURRENCY);

    const available = [...foreign];

    for (const gel of base) {
      const index = available.findIndex((row) => Math.sign(row.amountMinor) === -Math.sign(gel.amountMinor));
      if (index === -1) {
        unpaired.push(gel.id);
        continue;
      }
      const other = available.splice(index, 1)[0]!;
      pairs.push({ pairId: `${key}|${gel.id}`, gelId: gel.id, foreignId: other.id });
    }

    for (const row of available) unpaired.push(row.id);
  }

  return { pairs, unpaired };
}
