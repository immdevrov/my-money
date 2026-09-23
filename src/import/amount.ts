export type AmountResult =
  | { ok: true; minor: number; extraPrecision: boolean }
  | { ok: false };

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function scaledFromDecimal(
  raw: string,
  decimals: number,
): { value: number; extraPrecision: boolean } {
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const dot = unsigned.indexOf('.');
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const fraction = dot === -1 ? '' : unsigned.slice(dot + 1);

  let value = Number(whole) * 10 ** decimals + Number(`${fraction}${'0'.repeat(decimals)}`.slice(0, decimals));
  if (Number(fraction[decimals] ?? '0') >= 5) value += 1;

  return { value: negative ? -value : value, extraPrecision: fraction.length > decimals };
}

export function minorFromDecimal(raw: string): { minor: number; extraPrecision: boolean } {
  const { value, extraPrecision } = scaledFromDecimal(raw, 2);
  return { minor: value, extraPrecision };
}

export function parseAmountMinor(cell: unknown): AmountResult {
  let raw: string;

  if (typeof cell === 'number' && Number.isFinite(cell)) {
    raw = String(cell);
  } else if (typeof cell === 'string') {
    raw = cell.trim().replace(/[\s,]/g, '');
  } else {
    return { ok: false };
  }

  if (!DECIMAL.test(raw)) return { ok: false };

  return { ok: true, ...minorFromDecimal(raw) };
}

export function formatMinor(minor: number): string {
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
