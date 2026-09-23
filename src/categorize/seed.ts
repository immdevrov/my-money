import type { Category } from '../domain/types';

export const CURRENCY_CONVERSION_ID = 'currency-conversion';

export const CURRENCY_CONVERSION: Category = {
  id: CURRENCY_CONVERSION_ID,
  name: 'Currency conversion',
  type: 'transfer',
  color: '--palette-12',
};
