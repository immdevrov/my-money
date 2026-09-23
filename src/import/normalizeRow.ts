import type { FailedRow, FailureReason, ParsedRow, RowCell } from '../domain/types';
import { parseAmountMinor } from './amount';
import { cellText, isBlank } from './cell';
import { parsePostingDate } from './date';
import { deriveFields } from './derive';
import type { HeaderRow } from './headerRow';

export type NormalizeResult =
  | { ok: true; parsed: ParsedRow; extraPrecisionCell: string | null }
  | { ok: false; failed: FailedRow };

function fail(rowNumber: number, details: string, reason: FailureReason): NormalizeResult {
  return { ok: false, failed: { rowNumber, details, reason } };
}

export function normalizeRow(
  row: unknown[],
  rowNumber: number,
  header: HeaderRow,
): NormalizeResult {
  const details = cellText(row[header.detailsIndex]);
  if (details === '') return fail(rowNumber, details, { code: 'missing-details' });

  const present = header.currencies
    .map((column) => ({ code: column.code, cell: row[column.columnIndex] }))
    .filter((column) => !isBlank(column.cell));

  if (present.length === 0) {
    const lastColumn = Math.max(row.length, ...header.currencies.map((c) => c.columnIndex + 1));
    const cells: RowCell[] = [];
    for (let column = header.detailsIndex + 1; column < lastColumn; column += 1) {
      cells.push({
        column: column + 1,
        value: cellText(row[column]),
        present: column < row.length,
      });
    }
    return fail(rowNumber, details, { code: 'no-currency-value', cells });
  }

  const only = present[0];
  if (present.length > 1 || only === undefined) {
    return fail(rowNumber, details, {
      code: 'multiple-currency-values',
      currencies: present.map((column) => column.code),
    });
  }

  const dateCell = row[header.dateIndex];
  const postingDate = parsePostingDate(dateCell);
  if (!postingDate.ok) {
    return fail(rowNumber, details, { code: 'unparseable-date', cell: cellText(dateCell) });
  }

  const amount = parseAmountMinor(only.cell);
  if (!amount.ok) {
    return fail(rowNumber, details, { code: 'unparseable-amount', cell: cellText(only.cell) });
  }

  const facts = {
    postingDate: postingDate.iso,
    currency: only.code,
    amountMinor: amount.minor,
    details,
  };

  return {
    ok: true,
    extraPrecisionCell: amount.extraPrecision ? cellText(only.cell) : null,
    parsed: { rowNumber, ...facts, ...deriveFields(facts) },
  };
}
