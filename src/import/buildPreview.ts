import type {
  DetailsKind,
  FailedRow,
  ParsedRow,
  PreviewResult,
  RowWarning,
} from '../domain/types';
import { isBlank } from './cell';
import { findHeaderRow } from './headerRow';
import { normalizeRow } from './normalizeRow';
import { validateRow } from './validate';

function emptyCounts(): Record<DetailsKind, number> {
  return { card: 0, conversion: 0, service: 0, fee: 0, transfer: 0, other: 0 };
}

export function buildPreview(rows: unknown[][]): PreviewResult {
  const header = findHeaderRow(rows);
  if (!header.ok) return { ok: false, error: header.error };

  const parsed: ParsedRow[] = [];
  const failed: FailedRow[] = [];
  const warnings: RowWarning[] = [];
  const countsByKind = emptyCounts();

  for (let index = header.headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (row.every(isBlank)) continue;

    const result = normalizeRow(row, index + 1, header);
    if (!result.ok) {
      failed.push(result.failed);
      continue;
    }

    parsed.push(result.parsed);
    countsByKind[result.parsed.kind] += 1;
    warnings.push(...validateRow(result.parsed, result.extraPrecisionCell));
  }

  return {
    ok: true,
    preview: {
      headerRowNumber: header.headerRowIndex + 1,
      headerCells: header.headerCells,
      currencyColumns: header.currencies.map((c) => ({ code: c.code, column: c.columnIndex + 1 })),
      currencies: header.currencies.map((column) => column.code),
      rows: parsed,
      failed,
      warnings,
      countsByKind,
    },
  };
}
