import { mkdir } from 'node:fs/promises';
import writeXlsxFile from 'write-excel-file/node';
import type { Cell, Row, Sheet } from 'write-excel-file/node';

const OUT_DIR = new URL('../fixtures/', import.meta.url);

const text = (value: string): Cell => ({ value, type: String });
const number = (value: number): Cell => ({ value, type: Number });
const dateCell = (value: Date): Cell => ({ value, type: Date, format: 'dd/mm/yyyy' });
const blank: Cell = null;

const CURRENCIES = ['GEL', 'USD', 'EUR', 'GBP'] as const;
type Currency = (typeof CURRENCIES)[number];

function dataRow(date: Cell, details: string, amounts: Partial<Record<Currency, Cell>>): Row {
  return [date, text(details), blank, ...CURRENCIES.map((code) => amounts[code] ?? blank)];
}

function card(
  currency: string,
  amount: string,
  merchant: string,
  place: string,
  mcc: string,
  when: string,
  last4 = '1111',
): string {
  return (
    `Payment - Amount: ${currency}${amount}; Merchant: ${merchant}, ${place}; MCC:${mcc};` +
    ` Date: ${when}; Card No: ****${last4};` +
    ` Payment transaction amount and currency: ${amount} ${currency}`
  );
}

function service(amount: string, when: string, payee: string, code: string): string {
  return (
    `Payment - Amount GEL${amount}; Payment, ${when} , payment service, ${payee},` +
    ` Subscriber number 1000000, payment code - ${code}`
  );
}

function fee(amount: string, when: string, payee: string, code: string): string {
  return (
    `Payment - Amount GEL${amount}; Payment Fee, ${when} , payment service, ${payee},` +
    ` Subscriber number 1000000, payment code - ${code}`
  );
}

const statementRows: Row[] = [
  [text('Account statement'), blank, blank, blank, blank, blank, blank, text('Printed 01/05/2025')],
  [],
  [text('Period'), text('01/01/2025 - 30/04/2025')],
  [],
  [text('Date'), text('Details'), blank, ...CURRENCIES.map((code) => text(code)), blank],
  dataRow(
    text('14/03/2025'),
    card('GEL', '45.50', 'Shop Alpha', 'Tbilisi, Tbilisi, Example St 1', '1001', '14/03/2025 14:23'),
    { GEL: number(-45.5) },
  ),
  dataRow(
    dateCell(new Date(Date.UTC(2025, 2, 20))),
    card('USD', '12.00', 'Stream Beta', 'Online, US', '1004', '20/03/2025 09:05'),
    { USD: number(-12) },
  ),
  dataRow(
    number(45748),
    card('GEL', '22.00', 'Courier Gamma', 'Tbilisi, Tbilisi', '1002', '31/03/2025 23:41'),
    { GEL: number(-22) },
  ),
  dataRow(
    text('05/02/2025'),
    card('EUR', '30.10', 'Meals Delta', 'Tallinn, EE', '1003', '05/02/2025 19:02', '5678'),
    { EUR: text('-30.10') },
  ),
  dataRow(text('10/02/2025'), 'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.', {
    GEL: number(273.5),
  }),
  dataRow(text('10/02/2025'), 'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735', {
    USD: number(-100),
  }),
  dataRow(text('12/02/2025'), fee('1.50', '12/02/2025', 'Bank Mu', '10000000001'), {
    GEL: number(-1.5),
  }),
  dataRow(text('18/02/2025'), service('50.88', '18/02/2025', 'Phone Kappa', '10000000002'), {
    GEL: number(-50.88),
  }),
  dataRow(text('20/02/2025'), 'Payment - Amount: GEL20.00; Standing order execution', {
    GEL: number(-20),
  }),
  dataRow(
    text('22/02/2025'),
    card('GEL', '10.00', 'Shop Epsilon', 'Tbilisi, Tbilisi, Example St 1', '1001', '22/02/2025 10:00'),
    { GEL: number(-12) },
  ),
  dataRow(text('24/02/2025'), service('10.08', '24/02/2025', 'Net Lambda', '10000000003'), {
    GEL: number(-10.075),
  }),
  dataRow(
    text('25/02/2025'),
    card('GEL', '15.00', 'Shop Zeta', 'Tbilisi, Tbilisi', '1001', '25/02/2025 12:00'),
    { GEL: number(-15), USD: number(-5) },
  ),
  dataRow(
    text('26/02/2025'),
    card('GEL', '5.00', 'Shop Eta', 'Tbilisi, Tbilisi', '1001', '26/02/2025 12:00'),
    {},
  ),
  dataRow(
    text('not a date'),
    card('GEL', '7.00', 'Shop Theta', 'Tbilisi, Tbilisi', '1001', '27/02/2025 12:00'),
    { GEL: number(-7) },
  ),
  dataRow(
    text('28/02/2025'),
    'Outgoing Transfer - Amount: GEL1,000.00; Beneficiary: Test Beneficiary;' +
      ' Account: GE00XX0000000000000000GEL; Bank: Example Bank EXAMPLE22; Details: Private',
    { GEL: number(-1000) },
  ),
];

const SAME_DATE_DETAILS = card(
  'GEL',
  '1.00',
  'Same Date',
  'Tbilisi, Tbilisi',
  '1001',
  '14/03/2025 08:00',
);

const dateFormRows: Row[] = [
  [text('Date'), text('Details'), text('GEL')],
  [text('14/03/2025'), text(SAME_DATE_DETAILS), number(-1)],
  [dateCell(new Date(Date.UTC(2025, 2, 14))), text(SAME_DATE_DETAILS), number(-1)],
  [number(45730), text(SAME_DATE_DETAILS), number(-1)],
  [
    { value: new Date(Date.UTC(2025, 2, 14, 21, 0)), type: Date, format: 'dd/mm/yyyy hh:mm' },
    text(SAME_DATE_DETAILS),
    number(-1),
  ],
];

const headerAtTopRows: Row[] = [
  [text('Date'), text('Details'), text('GEL')],
  [
    text('01/01/2025'),
    text(card('GEL', '1.00', 'First', 'Tbilisi, Tbilisi', '1001', '01/01/2025 10:00')),
    number(-1),
  ],
  [blank, blank, blank],
  [
    text('02/01/2025'),
    text(card('GEL', '2.00', 'Second', 'Tbilisi, Tbilisi', '1001', '02/01/2025 10:00')),
    number(-2),
  ],
];

const gappedCurrencyRows: Row[] = [
  [text('Date'), text('Details'), blank, text('GEL'), blank, text('USD'), blank],
  [
    text('03/01/2025'),
    text(card('GEL', '3.00', 'Gap GEL', 'Tbilisi, Tbilisi', '1001', '03/01/2025 10:00')),
    blank,
    number(-3),
    blank,
    blank,
    blank,
  ],
  [
    text('04/01/2025'),
    text(card('USD', '4.00', 'Gap USD', 'Tbilisi, Tbilisi', '1001', '04/01/2025 10:00')),
    blank,
    blank,
    blank,
    number(-4),
    blank,
  ],
];

const noHeaderRowRows: Row[] = [
  [text('Account'), text('GE00XX0000000000000000')],
  [text('Opening balance'), number(100)],
];

const badCurrencyHeaderRows: Row[] = [
  [text('Date'), text('Details'), text('GEL'), text('Balance')],
  [
    text('01/01/2025'),
    text(card('GEL', '1.00', 'First', 'Tbilisi, Tbilisi', '1001', '01/01/2025 10:00')),
    number(-1),
    number(100),
  ],
];

const summaryRows: Row[] = [
  [text('Account'), text('GE00XX0000000000000000')],
  [text('Holder'), text('Test User')],
];
const infoRows: Row[] = [[text('Generated'), text('synthetic fixture')]];

const fixtures: { name: string; sheets: Sheet<never>[] }[] = [
  {
    name: 'statement-sample',
    sheets: [
      { sheet: 'Summary', data: summaryRows },
      { sheet: 'Transactions', data: statementRows },
      { sheet: 'Info', data: infoRows },
    ],
  },
  { name: 'date-forms', sheets: [{ sheet: 'Transactions', data: dateFormRows }] },
  {
    name: 'no-transactions-sheet',
    sheets: [
      { sheet: 'Summary', data: summaryRows },
      { sheet: 'Data', data: infoRows },
    ],
  },
  { name: 'header-at-top', sheets: [{ sheet: 'Transactions', data: headerAtTopRows }] },
  { name: 'bad-currency-header', sheets: [{ sheet: 'Transactions', data: badCurrencyHeaderRows }] },
  { name: 'no-header-row', sheets: [{ sheet: 'Transactions', data: noHeaderRowRows }] },
  { name: 'gapped-currency-columns', sheets: [{ sheet: 'Transactions', data: gappedCurrencyRows }] },
];

await mkdir(OUT_DIR, { recursive: true });

for (const fixture of fixtures) {
  const path = new URL(`${fixture.name}.xlsx`, OUT_DIR);
  await writeXlsxFile(fixture.sheets).toFile(path.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  console.log(`wrote fixtures/${fixture.name}.xlsx`);
}
