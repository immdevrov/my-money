import { RATE_SCALE } from '../import/details/conversion';

export function toGelMinor(amountMinor: number, rateScaled: number): number {
  const negative = amountMinor < 0;
  const product = Math.abs(amountMinor) * rateScaled;
  const whole = Math.floor(product / RATE_SCALE);
  const remainder = product - whole * RATE_SCALE;
  const rounded = remainder * 2 >= RATE_SCALE ? whole + 1 : whole;

  return negative ? -rounded : rounded;
}
