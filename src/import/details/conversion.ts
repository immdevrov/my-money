import { scaledFromDecimal } from '../amount';

const RATE = /rate:?\s*(\d+(?:\.\d+)?)/i;

export const RATE_SCALE = 1_000_000;
const RATE_DECIMALS = 6;

export function parseConversionRate(body: string): number | null {
  const match = RATE.exec(body);
  if (!match || match[1] === undefined) return null;
  return scaledFromDecimal(match[1], RATE_DECIMALS).value;
}

export function formatRate(scaled: number): string {
  const negative = scaled < 0;
  const digits = String(Math.abs(scaled)).padStart(RATE_DECIMALS + 1, '0');
  const whole = digits.slice(0, -RATE_DECIMALS);
  const fraction = digits.slice(-RATE_DECIMALS).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`;
}
