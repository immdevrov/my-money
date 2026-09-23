import type { ParsedRow } from '../domain/types';

export type IdentifiedRow = ParsedRow & { id: string };

export function rowId(row: ParsedRow, occurrence: number): string {
  return JSON.stringify([row.postingDate, row.currency, row.amountMinor, row.details, occurrence]);
}

export function assignIds(rows: ParsedRow[]): IdentifiedRow[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const tuple = rowId(row, 0);
    const occurrence = seen.get(tuple) ?? 0;
    seen.set(tuple, occurrence + 1);
    return { ...row, id: rowId(row, occurrence) };
  });
}

export function splitNewAndDuplicate(
  rows: IdentifiedRow[],
  existing: ReadonlySet<string>,
): { newRows: IdentifiedRow[]; duplicates: IdentifiedRow[] } {
  const newRows: IdentifiedRow[] = [];
  const duplicates: IdentifiedRow[] = [];

  for (const row of rows) {
    if (existing.has(row.id)) duplicates.push(row);
    else newRows.push(row);
  }

  return { newRows, duplicates };
}
