import { cellText } from './cell';
import type { WorkbookError } from '../domain/types';

const CURRENCY_CODE = /^[A-Z]{3}$/;

export type CurrencyColumn = { code: string; columnIndex: number };

export type HeaderRow = {
  headerRowIndex: number;
  headerCells: string[];
  dateIndex: number;
  detailsIndex: number;
  currencies: CurrencyColumn[];
};

export type HeaderResult =
  | ({ ok: true } & HeaderRow)
  | { ok: false; error: WorkbookError };

export function findHeaderRow(rows: unknown[][]): HeaderResult {
  for (let index = 0; index < rows.length; index += 1) {
    const cells = (rows[index] ?? []).map(cellText);
    const dateIndex = cells.indexOf('Date');
    const detailsIndex = cells.indexOf('Details');
    if (dateIndex === -1 || detailsIndex === -1) continue;

    const after = cells
      .map((text, columnIndex) => ({ text, columnIndex }))
      .filter((cell) => cell.columnIndex > detailsIndex && cell.text !== '');

    for (const cell of after) {
      if (!CURRENCY_CODE.test(cell.text)) {
        return {
          ok: false,
          error: { code: 'invalid-currency-header', header: cell.text, headerCells: cells },
        };
      }
    }

    return {
      ok: true,
      headerRowIndex: index,
      headerCells: cells,
      dateIndex,
      detailsIndex,
      currencies: after.map((cell) => ({ code: cell.text, columnIndex: cell.columnIndex })),
    };
  }

  return { ok: false, error: { code: 'header-row-not-found' } };
}
