import type { StatementCell } from './makeStatement';

export const MONTHS: StatementCell[][] = [
  ['10/01/2025', 'Grocer Jan', -100],
  ['12/01/2025', 'Taxi Jan', -20],
  ['10/02/2025', 'Grocer Feb', -50],
  ['10/03/2025', 'Grocer Mar', -80],
  ['12/03/2025', 'Taxi Mar', -10],
  ['10/05/2025', 'Grocer May', -120],
  ['12/05/2025', 'Taxi May', -30],
  ['10/06/2025', 'Grocer Jun', -40],
];

export const MIXED_OPTIONS = { header: ['Date', 'Details', 'GEL', 'USD'] };

export const MIXED: StatementCell[][] = [
  ...MONTHS.map((row) => [...row, null]),
  ['25/03/2025', 'Salary Mar', 1500, null],
  ['25/04/2025', 'Salary Apr', 1500, null],
  ['25/05/2025', 'Salary May', 1500, null],
  ['20/05/2025', 'Grocer refund', 10, null],
  ['15/05/2025', 'Mystery out', -7, null],
  ['16/05/2025', 'Mystery in', 5, null],
  ['18/05/2025', 'Savings May', -500, null],
  ['19/05/2025', 'Hidden May', -60, null],
  ['10/05/2025', 'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.', 273.5, null],
  ['10/05/2025', 'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735', null, -100],
];

export const MISSING_RATE_SHORT_POOL: StatementCell[][] = [
  ['10/03/2025', 'Grocer Mar', -80, null],
  ['12/04/2025', 'Payment - Amount: USD4.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -4],
  ['10/05/2025', 'Grocer May', -120, null],
  ['12/05/2025', 'Payment - Amount: USD9.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -9],
];

export const MIXED_CATEGORIES = [
  { name: 'Groceries', contains: 'Grocer' },
  { name: 'Transport', contains: 'Taxi' },
  { name: 'Salary', type: 'income' as const, contains: 'Salary' },
  { name: 'Savings', type: 'transfer' as const, contains: 'Savings' },
  { name: 'Hidden', type: 'ignore' as const, contains: 'Hidden' },
];
