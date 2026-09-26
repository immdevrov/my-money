import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import DashboardView from '../src/ui/views/DashboardView.svelte';
import { categorize } from './helpers/categorize';
import {
  MISSING_RATE_SHORT_POOL,
  MIXED,
  MIXED_CATEGORIES,
  MIXED_OPTIONS,
  MONTHS,
} from './helpers/dashboardData';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

type Screen = Awaited<ReturnType<typeof render>>;

const CATEGORIES = [
  { name: 'Groceries', contains: 'Grocer' },
  { name: 'Transport', contains: 'Taxi' },
  { name: 'Unused' },
];

const QUARTERS: StatementCell[][] = [
  ['10/11/2023', 'Grocer 23Q4', -200],
  ['10/02/2024', 'Grocer 24Q1', -30],
  ['10/05/2024', 'Grocer 24Q2', -60],
  ['10/08/2024', 'Grocer 24Q3', -120],
  ['10/02/2025', 'Grocer 25Q1', -40],
  ['10/04/2025', 'Grocer 25Q2', -10],
];

const YEARS: StatementCell[][] = [
  ['01/03/2020', 'Grocer 2020', -90],
  ['01/03/2021', 'Grocer 2021', -100],
  ['01/03/2022', 'Grocer 2022', -250],
  ['01/03/2024', 'Grocer 2024', -300],
  ['01/03/2025', 'Grocer 2025', -50],
];

const GROCERIES = [{ name: 'Groceries', contains: 'Grocer' }];

const BOUNDARY_ROWS: StatementCell[][] = [
  [
    '01/05/2025',
    'Payment - Amount: GEL25.00; Merchant: Grocer Omega, Tbilisi; MCC:1001; Date: 30/04/2025 18:00; Card No: ****1111',
    -25,
  ],
  ['10/01/2025', 'Grocer Jan', -100],
  ['10/02/2025', 'Grocer Feb', -50],
  ['10/03/2025', 'Grocer Mar', -80],
];

const MISSING_RATE: StatementCell[][] = [
  ...MONTHS.map((row) => [...row, null]),
  ['12/03/2025', 'Payment - Amount: USD4.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -4],
  ['12/05/2025', 'Payment - Amount: USD9.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -9],
  ['12/05/2025', 'Payment - Amount: USD6.00; Merchant: Hidden Sigma, Online; MCC:1001', null, -6],
];

const MISSING_RATE_CATEGORIES = [...CATEGORIES, { name: 'Hidden', type: 'ignore' as const, contains: 'Hidden' }];

const PER_PERIOD_TOTALS: StatementCell[][] = [
  ['10/01/2025', 'Grocer Jan', -100],
  ['10/02/2025', 'Grocer Feb', -10],
  ['10/03/2025', 'Grocer Mar', -50],
  ['12/01/2025', 'Taxi Jan', -10],
  ['12/02/2025', 'Taxi Feb', -100],
  ['12/03/2025', 'Taxi Mar', -20],
  ['10/04/2025', 'Grocer Apr', -10],
];

const YEAR_AGO: StatementCell[][] = [
  ['10/05/2024', 'Grocer May 24', -200],
  ['10/10/2024', 'Grocer Oct 24', -300],
  ['10/11/2024', 'Grocer Nov 24', -60],
  ['10/12/2024', 'Grocer Dec 24', -90],
  ['10/01/2025', 'Grocer Jan', -30],
  ['10/03/2025', 'Grocer Mar', -60],
  ['10/04/2025', 'Grocer Apr', -150],
  ['10/05/2025', 'Grocer May', -100],
];

const YEAR_AGO_MISSING_RATE: StatementCell[][] = [
  ...YEAR_AGO.map((row) => [...row, null]),
  ['12/05/2024', 'Payment - Amount: USD4.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -4],
  ['12/10/2024', 'Payment - Amount: USD5.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -5],
  ['12/12/2024', 'Payment - Amount: USD6.00; Merchant: Grocer Sigma, Online; MCC:1001', null, -6],
];

const MONTH_COLUMNS = [
  'Category',
  'Current',
  'Mean (6 months)',
  'vs mean',
  'Median (6 months)',
  'vs median',
  'Previous month',
  'vs previous month',
  'Same month last year',
  'vs same month last year',
];

const QUARTER_COLUMNS = [
  'Category',
  'Current',
  'Mean (4 quarters)',
  'vs mean',
  'Median (4 quarters)',
  'vs median',
  'Previous quarter',
  'vs previous quarter',
  'Same quarter last year',
  'vs same quarter last year',
];

const YEAR_COLUMNS = [
  'Category',
  'Current',
  'Mean (3 years)',
  'vs mean',
  'Median (3 years)',
  'vs median',
  'Previous year',
  'vs previous year',
];

const INSUFFICIENT = ['insufficient data', ''];

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function rowsIn(screen: Screen, tableName: string) {
  return screen.getByRole('table', { name: tableName }).getByRole('row');
}

function spendingRows(screen: Screen) {
  return rowsIn(screen, 'Spending comparison');
}

async function expectRowIn(screen: Screen, tableName: string, index: number, cells: string[]) {
  const [name = '', ...values] = cells;
  const row = rowsIn(screen, tableName).nth(index);
  await expect.element(row.getByRole('rowheader')).toHaveTextContent(exactly(name));
  for (const [column, value] of values.entries()) {
    await expect.element(row.getByRole('cell').nth(column)).toHaveTextContent(exactly(value));
  }
}

async function expectRow(screen: Screen, index: number, cells: string[]) {
  return expectRowIn(screen, 'Spending comparison', index, cells);
}

async function expectColumns(screen: Screen, columns: string[]) {
  const header = spendingRows(screen).first();
  for (const [index, column] of columns.entries()) {
    await expect.element(header.getByRole('columnheader').nth(index)).toHaveTextContent(exactly(column));
  }
  await expect.element(header.getByRole('columnheader').nth(columns.length)).not.toBeInTheDocument();
}

const SLOW = { timeout: 5000 };

test('defaults to the last complete month and shows every baseline side by side', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);

  await expect.element(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2025-05');
  await expect
    .element(period.getByRole('option').first())
    .toHaveTextContent('2025-06 (in progress)');

  await expectColumns(screen, MONTH_COLUMNS);

  await expectRow(screen, 1, ['Groceries', '120.00', '57.50', '+62.50 (+109%)', '80.00', '+40.00 (+50%)', '0.00', '+120.00 (—)', ...INSUFFICIENT]);
  await expectRow(screen, 2, ['Transport', '30.00', '7.50', '+22.50 (+300%)', ...INSUFFICIENT, '0.00', '+30.00 (—)', ...INSUFFICIENT]);
  await expectRow(screen, 3, ['Total spending', '150.00', '65.00', '+85.00 (+131%)', '90.00', '+60.00 (+67%)', '0.00', '+150.00 (—)', ...INSUFFICIENT]);
  await expect.element(spendingRows(screen).nth(4)).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('table', { name: 'Spending comparison' }).getByText('Unused'))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText(/excluded from totals/)).not.toBeInTheDocument();
});

test('the current month can be compared but never feeds a baseline', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);

  const period = screen.getByLabelText(/^Period$/);
  await period.selectOptions(period.getByRole('option', { name: '2025-06 (in progress)' }));

  await expectRow(screen, 1, ['Groceries', '40.00', '70.00', '-30.00 (-43%)', '90.00', '-50.00 (-56%)', '120.00', '-80.00 (-67%)']);
  await expectRow(screen, 2, ['Transport', '0.00', '12.00', '-12.00 (-100%)', '20.00', '-20.00 (-100%)', '30.00', '-30.00 (-100%)']);
  await expectRow(screen, 3, ['Total spending', '40.00', '82.00', '-42.00 (-51%)', '105.00', '-65.00 (-62%)', '150.00', '-110.00 (-73%)']);
  await expect.element(spendingRows(screen).nth(4)).not.toBeInTheDocument();
});

test('fewer than 3 complete periods shows insufficient data', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows([
    ['10/03/2025', 'Grocer Mar', -80],
    ['10/05/2025', 'Grocer May', -120],
  ]);
  await categorize([{ name: 'Groceries', contains: 'Grocer' }]);

  const screen = await render(DashboardView);

  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');
  await expectRow(screen, 1, ['Groceries', '120.00', ...INSUFFICIENT, ...INSUFFICIENT, ...INSUFFICIENT]);
  await expectRow(screen, 2, ['Total spending', '120.00', ...INSUFFICIENT, ...INSUFFICIENT, ...INSUFFICIENT]);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();
});

test('the total baselines come from per-period totals', SLOW, async () => {
  freezeDate('2025-05-15T12:00:00');
  await importRows(PER_PERIOD_TOTALS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-04');

  await expectRow(screen, 1, ['Groceries', '10.00', '53.33', '-43.33 (-81%)', '50.00', '-40.00 (-80%)', '50.00', '-40.00 (-80%)']);
  await expectRow(screen, 2, ['Transport', '0.00', '43.33', '-43.33 (-100%)', '20.00', '-20.00 (-100%)', '20.00', '-20.00 (-100%)']);
  await expectRow(screen, 3, ['Total spending', '10.00', '96.67', '-86.67 (-90%)', '110.00', '-100.00 (-91%)', '70.00', '-60.00 (-86%)']);
  await expect.element(spendingRows(screen).nth(4)).not.toBeInTheDocument();
});

test('a window of fewer than 3 earlier periods has no baseline', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  const period = screen.getByLabelText(/^Period$/);
  await period.selectOptions(period.getByRole('option', { name: '2025-03' }));

  const insufficient = [...INSUFFICIENT, ...INSUFFICIENT, ...INSUFFICIENT, ...INSUFFICIENT];
  await expectRow(screen, 1, ['Groceries', '80.00', ...insufficient]);
  await expectRow(screen, 2, ['Transport', '10.00', ...insufficient]);
  await expectRow(screen, 3, ['Total spending', '90.00', ...insufficient]);
});

test('periods after the compared one never feed its baselines', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  const period = screen.getByLabelText(/^Period$/);
  await period.selectOptions(period.getByRole('option', { name: '2025-04' }));

  await expectRow(screen, 1, ['Groceries', '0.00', '76.67', '-76.67 (-100%)', '80.00', '-80.00 (-100%)', '80.00', '-80.00 (-100%)']);
  await expectRow(screen, 2, ['Transport', '0.00', '10.00', '-10.00 (-100%)', ...INSUFFICIENT, '10.00', '-10.00 (-100%)']);
  await expectRow(screen, 3, ['Total spending', '0.00', '86.67', '-86.67 (-100%)', '90.00', '-90.00 (-100%)', '90.00', '-90.00 (-100%)']);
  await expect.element(spendingRows(screen).nth(4)).not.toBeInTheDocument();
});

test('a month is compared with the last 6 months and the same month last year', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(YEAR_AGO);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);
  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');

  const cells = ['100.00', '65.00', '+35.00 (+54%)', '60.00', '+40.00 (+67%)', '150.00', '-50.00 (-33%)', '200.00', '-100.00 (-50%)'];
  await expectRow(screen, 1, ['Groceries', ...cells]);
  await expectRow(screen, 2, ['Total spending', ...cells]);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();
});

test('the missing-rate count covers the window and the same month last year', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(YEAR_AGO_MISSING_RATE, MIXED_OPTIONS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);

  await expect
    .element(screen.getByText('2 transactions excluded from totals: no exchange rate.'))
    .toBeVisible();
  await expectRow(screen, 1, ['Groceries', '100.00', '65.00']);
});

test('resets to the default quarter and compares against every baseline', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(QUARTERS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);
  const periodType = screen.getByLabelText(/^Period type$/);
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Quarter' }));

  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2025 Q1');
  await expectColumns(screen, QUARTER_COLUMNS);

  const cells = ['40.00', '52.50', '-12.50 (-24%)', '60.00', '-20.00 (-33%)', '0.00', '+40.00 (—)', '30.00', '+10.00 (+33%)'];
  await expectRow(screen, 1, ['Groceries', ...cells]);
  await expectRow(screen, 2, ['Total spending', ...cells]);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();
});

test('resets to the default year and compares against every baseline', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(YEARS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);
  const periodType = screen.getByLabelText(/^Period type$/);
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Year' }));

  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2024');
  await expectColumns(screen, YEAR_COLUMNS);

  const cells = ['300.00', '116.67', '+183.33 (+157%)', ...INSUFFICIENT, '0.00', '+300.00 (—)'];
  await expectRow(screen, 1, ['Groceries', ...cells]);
  await expectRow(screen, 2, ['Total spending', ...cells]);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();
});

test('spending nets refunds, splits uncategorized by sign and excludes transfers', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);

  const screen = await render(DashboardView);

  await expectRow(screen, 1, ['Groceries', '110.00', '57.50', '+52.50 (+91%)', '80.00', '+30.00 (+38%)', '0.00', '+110.00 (—)']);
  await expectRow(screen, 2, ['Transport', '30.00', '7.50', '+22.50 (+300%)', ...INSUFFICIENT, '0.00', '+30.00 (—)']);
  await expectRow(screen, 3, ['Uncategorized', '7.00', '0.00', '+7.00 (—)', ...INSUFFICIENT, '0.00', '+7.00 (—)']);
  await expectRow(screen, 4, ['Total spending', '147.00', '65.00', '+82.00 (+126%)', '90.00', '+57.00 (+63%)', '0.00', '+147.00 (—)']);
  await expect.element(spendingRows(screen).nth(5)).not.toBeInTheDocument();

  const spendingTable = screen.getByRole('table', { name: 'Spending comparison' });
  await expect.element(spendingTable.getByText('Savings')).not.toBeInTheDocument();
  await expect.element(spendingTable.getByText('Hidden')).not.toBeInTheDocument();
  await expect.element(spendingTable.getByText('Currency conversion')).not.toBeInTheDocument();
});

test('the Income tab shows income categories and uncategorized inflows', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);

  const screen = await render(DashboardView);
  await screen.getByRole('tab', { name: 'Income' }).click();

  await expect
    .element(screen.getByRole('table', { name: 'Spending comparison' }))
    .not.toBeInTheDocument();

  await expectRowIn(screen, 'Income comparison', 1, ['Salary', '1500.00', '750.00', '+750.00 (+100%)', ...INSUFFICIENT, '1500.00', '0.00 (0%)']);
  await expectRowIn(screen, 'Income comparison', 2, ['Uncategorized', '5.00', '0.00', '+5.00 (—)', ...INSUFFICIENT, '0.00', '+5.00 (—)']);
  await expectRowIn(screen, 'Income comparison', 3, ['Total income', '1505.00', '750.00', '+755.00 (+101%)', ...INSUFFICIENT, '1500.00', '+5.00 (0%)']);
  await expect.element(rowsIn(screen, 'Income comparison').nth(4)).not.toBeInTheDocument();
});

test('arrow keys move between tabs', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);

  const screen = await render(DashboardView);
  const spendingTab = screen.getByRole('tab', { name: 'Spending' });
  const incomeTab = screen.getByRole('tab', { name: 'Income' });

  await spendingTab.click();
  await expect.element(spendingTab).toHaveFocus();

  await userEvent.keyboard('{ArrowRight}');

  await expect.element(incomeTab).toHaveFocus();
  await expect.element(incomeTab).toHaveAttribute('aria-selected', 'true');
  await expect.element(screen.getByRole('table', { name: 'Income comparison' })).toBeVisible();
});

test('a month-boundary card payment counts in its effective month', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(BOUNDARY_ROWS);
  await categorize([{ name: 'Groceries', contains: 'Grocer' }]);

  const screen = await render(DashboardView);
  const period = screen.getByLabelText(/^Period$/);

  await period.selectOptions(period.getByRole('option', { name: '2025-04' }));
  const april = ['25.00', '76.67', '-51.67 (-67%)', '80.00', '-55.00 (-69%)', '80.00', '-55.00 (-69%)'];
  await expectRow(screen, 1, ['Groceries', ...april]);
  await expectRow(screen, 2, ['Total spending', ...april]);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();

  await period.selectOptions(period.getByRole('option', { name: '2025-05' }));
  const may = ['0.00', '63.75', '-63.75 (-100%)', '65.00', '-65.00 (-100%)', '25.00', '-25.00 (-100%)'];
  await expectRow(screen, 1, ['Groceries', ...may]);
  await expectRow(screen, 2, ['Total spending', ...may]);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();
});

test('rows without a rate are counted and excluded', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MISSING_RATE, MIXED_OPTIONS);
  await categorize(MISSING_RATE_CATEGORIES);

  const screen = await render(DashboardView);

  await expect
    .element(screen.getByText('2 transactions excluded from totals: no exchange rate.'))
    .toBeVisible();
  await expectRow(screen, 1, ['Groceries', '120.00', '57.50', '+62.50 (+109%)', '80.00']);
  await expect
    .element(screen.getByRole('table', { name: 'Spending comparison' }).getByText('Hidden'))
    .not.toBeInTheDocument();
});

test('with fewer than 3 pool periods only the compared period is counted', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MISSING_RATE_SHORT_POOL, MIXED_OPTIONS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);

  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');
  await expect
    .element(screen.getByText('1 transaction excluded from totals: no exchange rate.'))
    .toBeVisible();
  await expectRow(screen, 1, ['Groceries', '120.00', ...INSUFFICIENT]);
});

test('an unknown period and a stale baseline in the URL are ignored', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  location.hash = '#/dashboard?period=1999-01&baseline=median';

  const screen = await render(DashboardView);

  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');
  await expect.element(screen.getByLabelText(/^Baseline$/)).not.toBeInTheDocument();
  await expectRow(screen, 1, ['Uncategorized', '150.00', '65.00', '+85.00 (+131%)', '90.00']);
});

test('the shown period stays pinned after the month changes', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');

  await screen.getByRole('tab', { name: 'Income' }).click();

  freezeDate('2025-07-15T12:00:00');
  const remounted = await remount(DashboardView);

  await expect.element(remounted.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');
  await expect
    .element(remounted.getByRole('tab', { name: 'Income' }))
    .toHaveAttribute('aria-selected', 'true');
});

test('an empty database shows the empty message', async () => {
  const screen = await render(DashboardView);

  await expect
    .element(screen.getByText('No transactions yet. Import a statement to see the dashboard.'))
    .toBeVisible();
  await expect.element(screen.getByLabelText(/^Period$/)).not.toBeInTheDocument();
  await expect.element(screen.getByRole('table')).not.toBeInTheDocument();
});
