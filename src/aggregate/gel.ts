import type { Transaction } from '../domain/types';
import { buildRateTable, rateFor, type Rate } from '../pairing/rates';
import { toGelMinor } from './convert';

const BASE_CURRENCY = 'GEL';

export function rateTableFrom(rows: Transaction[]): Rate[] {
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

export function gelAmount(row: Transaction, table: Rate[]): number | null {
  if (row.currency === BASE_CURRENCY) return row.amountMinor;

  const rate = rateFor(table, row.currency, row.effectiveDate);
  if (rate === null) return null;

  return toGelMinor(row.amountMinor, rate.rateScaled);
}
