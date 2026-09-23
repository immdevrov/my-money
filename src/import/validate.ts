import type { ParsedRow, RowWarning } from '../domain/types';
import { formatMinor } from './amount';

export function validateRow(row: ParsedRow, extraPrecisionCell: string | null): RowWarning[] {
  if (extraPrecisionCell === null) return [];

  return [
    {
      rowNumber: row.rowNumber,
      code: 'unexpected-precision',
      cell: extraPrecisionCell,
      rounded: formatMinor(row.amountMinor),
    },
  ];
}
