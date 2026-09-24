import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import DashboardView from '../src/ui/views/DashboardView.svelte';
import { categorize } from './helpers/categorize';
import { MIXED, MIXED_CATEGORIES, MIXED_OPTIONS, MONTHS } from './helpers/dashboardData';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';

type Screen = Awaited<ReturnType<typeof render>>;

const CATEGORIES = [
  { name: 'Groceries', contains: 'Grocer' },
  { name: 'Transport', contains: 'Taxi' },
  { name: 'Unused' },
];

const QUARTERS: StatementCell[][] = [
  ['10/02/2024', 'Grocer 24Q1', -30],
  ['10/05/2024', 'Grocer 24Q2', -60],
  ['10/08/2024', 'Grocer 24Q3', -120],
  ['10/02/2025', 'Grocer 25Q1', -40],
  ['10/04/2025', 'Grocer 25Q2', -10],
];

const YEARS: StatementCell[][] = [
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

const SLOW = { timeout: 5000 };

test('defaults to the last complete month and compares it with the mean', SLOW, async () => {
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

  await expectRow(screen, 1, ['Groceries', '120.00', '57.50', '+62.50', '+109%']);
  await expectRow(screen, 2, ['Transport', '30.00', '7.50', '+22.50', '+300%']);
  await expectRow(screen, 3, ['Total spending', '150.00', '65.00', '+85.00', '+131%']);
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

  await expectRow(screen, 1, ['Groceries', '40.00', '70.00', '-30.00', '-43%']);
  await expectRow(screen, 2, ['Transport', '0.00', '12.00', '-12.00', '-100%']);
  await expectRow(screen, 3, ['Total spending', '40.00', '82.00', '-42.00', '-51%']);
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
  await expectRow(screen, 1, ['Groceries', '120.00', 'insufficient data', '', '']);
  await expectRow(screen, 2, ['Total spending', '120.00', 'insufficient data', '', '']);
});

test('compares months against the median and previous baselines', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  const baseline = screen.getByLabelText(/^Baseline$/);

  await baseline.selectOptions(baseline.getByRole('option', { name: 'Median' }));
  await expectRow(screen, 1, ['Groceries', '120.00', '65.00', '+55.00', '+85%']);
  await expectRow(screen, 2, ['Transport', '30.00', '5.00', '+25.00', '+500%']);
  await expectRow(screen, 3, ['Total spending', '150.00', '70.00', '+80.00', '+114%']);

  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));
  await expectRow(screen, 1, ['Groceries', '120.00', '0.00', '+120.00', '—']);
  await expectRow(screen, 2, ['Transport', '30.00', '0.00', '+30.00', '—']);
  await expectRow(screen, 3, ['Total spending', '150.00', '0.00', '+150.00', '—']);
});

test('previous is insufficient for the first period in the span', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  const period = screen.getByLabelText(/^Period$/);
  await period.selectOptions(period.getByRole('option', { name: '2025-01' }));
  const baseline = screen.getByLabelText(/^Baseline$/);
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));

  await expectRow(screen, 1, ['Groceries', '100.00', 'insufficient data', '', '']);
});

test('resets to the default quarter and compares against each baseline', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(QUARTERS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);
  const periodType = screen.getByLabelText(/^Period type$/);
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Quarter' }));

  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2025 Q1');

  await expectRow(screen, 1, ['Groceries', '40.00', '52.50', '-12.50', '-24%']);
  await expectRow(screen, 2, ['Total spending', '40.00', '52.50', '-12.50', '-24%']);

  const baseline = screen.getByLabelText(/^Baseline$/);
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Median' }));
  await expectRow(screen, 1, ['Groceries', '40.00', '45.00', '-5.00', '-11%']);
  await expectRow(screen, 2, ['Total spending', '40.00', '45.00', '-5.00', '-11%']);

  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));
  await expectRow(screen, 1, ['Groceries', '40.00', '0.00', '+40.00', '—']);
  await expectRow(screen, 2, ['Total spending', '40.00', '0.00', '+40.00', '—']);
});

test('resets to the default year and compares against each baseline', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(YEARS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);
  const periodType = screen.getByLabelText(/^Period type$/);
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Year' }));

  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2024');

  await expectRow(screen, 1, ['Groceries', '300.00', '116.67', '+183.33', '+157%']);
  await expectRow(screen, 2, ['Total spending', '300.00', '116.67', '+183.33', '+157%']);

  const baseline = screen.getByLabelText(/^Baseline$/);
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Median' }));
  await expectRow(screen, 1, ['Groceries', '300.00', '100.00', '+200.00', '+200%']);
  await expectRow(screen, 2, ['Total spending', '300.00', '100.00', '+200.00', '+200%']);

  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));
  await expectRow(screen, 1, ['Groceries', '300.00', '0.00', '+300.00', '—']);
  await expectRow(screen, 2, ['Total spending', '300.00', '0.00', '+300.00', '—']);
});

test('spending nets refunds, splits uncategorized by sign and excludes transfers', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);

  const screen = await render(DashboardView);

  await expectRow(screen, 1, ['Groceries', '110.00', '57.50', '+52.50', '+91%']);
  await expectRow(screen, 2, ['Transport', '30.00', '7.50', '+22.50', '+300%']);
  await expectRow(screen, 3, ['Uncategorized', '7.00', '0.00', '+7.00', '—']);
  await expectRow(screen, 4, ['Total spending', '147.00', '65.00', '+82.00', '+126%']);
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

  await expectRowIn(screen, 'Income comparison', 1, [
    'Salary',
    '1500.00',
    '750.00',
    '+750.00',
    '+100%',
  ]);
  await expectRowIn(screen, 'Income comparison', 2, ['Uncategorized', '5.00', '0.00', '+5.00', '—']);
  await expectRowIn(screen, 'Income comparison', 3, [
    'Total income',
    '1505.00',
    '750.00',
    '+755.00',
    '+101%',
  ]);
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
  await expectRow(screen, 1, ['Groceries', '25.00', '57.50', '-32.50', '-57%']);
  await expectRow(screen, 2, ['Total spending', '25.00', '57.50', '-32.50', '-57%']);
  await expect.element(spendingRows(screen).nth(3)).not.toBeInTheDocument();

  await period.selectOptions(period.getByRole('option', { name: '2025-05' }));
  await expectRow(screen, 1, ['Groceries', '0.00', '63.75', '-63.75', '-100%']);
  await expectRow(screen, 2, ['Total spending', '0.00', '63.75', '-63.75', '-100%']);
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
  await expectRow(screen, 1, ['Groceries', '120.00', '57.50']);
  await expect
    .element(screen.getByRole('table', { name: 'Spending comparison' }).getByText('Hidden'))
    .not.toBeInTheDocument();

  const baseline = screen.getByLabelText(/^Baseline$/);
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));
  await expect
    .element(screen.getByText('1 transaction excluded from totals: no exchange rate.'))
    .toBeVisible();
});

test('the count covers only the compared period when the baseline is insufficient', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MISSING_RATE, MIXED_OPTIONS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  const period = screen.getByLabelText(/^Period$/);
  await period.selectOptions(period.getByRole('option', { name: '2025-01' }));
  const baseline = screen.getByLabelText(/^Baseline$/);
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));

  await expect.element(screen.getByText(/excluded from totals/)).not.toBeInTheDocument();
});

test('an unknown period in the URL falls back to the default', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  location.hash = '#/dashboard?period=1999-01';

  const screen = await render(DashboardView);

  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025-05');
});

test('an empty database shows the empty message', async () => {
  const screen = await render(DashboardView);

  await expect
    .element(screen.getByText('No transactions yet. Import a statement to see the dashboard.'))
    .toBeVisible();
  await expect.element(screen.getByLabelText(/^Period$/)).not.toBeInTheDocument();
  await expect.element(screen.getByRole('table')).not.toBeInTheDocument();
});
