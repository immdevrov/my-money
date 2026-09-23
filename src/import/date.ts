const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DMY_HM = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

export type DateResult = { ok: true; iso: string } | { ok: false };

function isoFromUtc(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoFromParts(day: string, month: string, year: string): string | null {
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoFromUtc(parsed) === iso ? iso : null;
}

export function parsePostingDate(cell: unknown): DateResult {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return { ok: false };
    return { ok: true, iso: isoFromUtc(cell) };
  }

  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const value = new Date(EXCEL_EPOCH_UTC + Math.round(cell) * MS_PER_DAY);
    if (Number.isNaN(value.getTime())) return { ok: false };
    return { ok: true, iso: isoFromUtc(value) };
  }

  if (typeof cell === 'string') {
    const match = DMY.exec(cell.trim());
    if (match) {
      const iso = isoFromParts(match[1] ?? '', match[2] ?? '', match[3] ?? '');
      if (iso !== null) return { ok: true, iso };
    }
  }

  return { ok: false };
}

export function parseTxDateTime(body: string): string | null {
  const match = DMY_HM.exec(body);
  if (!match) return null;

  const iso = isoFromParts(match[1] ?? '', match[2] ?? '', match[3] ?? '');
  if (iso === null) return null;

  return `${iso}T${match[4]}:${match[5]}`;
}
