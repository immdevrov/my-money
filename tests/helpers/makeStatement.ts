import writeXlsxFile from 'write-excel-file/browser';
import type { Cell, Row } from 'write-excel-file/browser';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type StatementCell = string | number | Date | null;

export type StatementOptions = {
  sheet?: string;
  header?: string[];
  fileName?: string;
};

const DEFAULT_HEADER = ['Date', 'Details', 'GEL'];

function toCell(value: StatementCell): Cell {
  if (value === null) return null;
  if (value instanceof Date) return { value, type: Date, format: 'dd/mm/yyyy' };
  if (typeof value === 'number') return { value, type: Number };
  return { value, type: String };
}

export async function makeStatement(
  rows: StatementCell[][],
  options: StatementOptions = {},
): Promise<File> {
  const { sheet = 'Transactions', header = DEFAULT_HEADER, fileName = 'statement.xlsx' } = options;

  const data: Row[] = [header.map((text) => toCell(text)), ...rows.map((row) => row.map(toCell))];
  const blob = await writeXlsxFile([{ sheet, data }]).toBlob();

  return new File([blob], fileName, { type: XLSX_MIME });
}
