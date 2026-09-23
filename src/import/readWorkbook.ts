import readXlsxFile from 'read-excel-file/browser';
import type { ReadResult } from '../domain/types';

export async function readWorkbook(file: File, sheetName: string): Promise<ReadResult> {
  const sheets = await readXlsxFile(file);
  const match = sheets.find((sheet) => sheet.sheet === sheetName);

  if (match === undefined) {
    return {
      ok: false,
      error: {
        code: 'sheet-not-found',
        sheetName,
        sheetsFound: sheets.map((sheet) => sheet.sheet),
      },
    };
  }

  return { ok: true, rows: match.data as unknown[][] };
}
