import type { Transaction } from '../domain/types';
import { buildRateTable, rateFor, type Rate } from '../pairing/rates';
import { toGelMinor } from './convert';

const BASE_CURRENCY = 'GEL';

export type Rates = { table: Rate[]; manual: Record<string, number> };

export type GelAmount = { minor: number; source: 'pair' | 'manual' };

function rateTableFrom(rows: Transaction[]): Rate[] {
  return buildRateTable(
    rows
      .filter((row) => row.paired && row.currency !== BASE_CURRENCY)
      .flatMap((row) =>
        row.conversionRateScaled === null
          ? []
          : [{ date: row.postingDate, currency: row.currency, rateScaled: row.conversionRateScaled }],
      ),
  );
}

export function ratesFrom(rows: Transaction[], manual: Record<string, number>): Rates {
  return { table: rateTableFrom(rows), manual };
}

export type ForeignCurrency = { currency: string; withoutRate: number };

export function foreignCurrencies(
  rows: Transaction[],
  manual: Record<string, number>,
): ForeignCurrency[] {
  const table = rateTableFrom(rows);
  const withoutRate = new Map<string, number>(Object.keys(manual).map((currency) => [currency, 0]));

  for (const row of rows) {
    if (row.currency === BASE_CURRENCY) continue;
    const missing = rateFor(table, row.currency, row.effectiveDate) === null ? 1 : 0;
    withoutRate.set(row.currency, (withoutRate.get(row.currency) ?? 0) + missing);
  }

  return [...withoutRate]
    .map(([currency, count]) => ({ currency, withoutRate: count }))
    .sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

export function gelAmount(row: Transaction, rates: Rates): GelAmount | null {
  if (row.currency === BASE_CURRENCY) return { minor: row.amountMinor, source: 'pair' };

  const rate = rateFor(rates.table, row.currency, row.effectiveDate);
  if (rate !== null) return { minor: toGelMinor(row.amountMinor, rate.rateScaled), source: 'pair' };

  const manual = rates.manual[row.currency];
  if (manual !== undefined) return { minor: toGelMinor(row.amountMinor, manual), source: 'manual' };

  return null;
}
