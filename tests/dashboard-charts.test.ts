import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
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

type Screen = Awaited<ReturnType<typeof render>>;

const SLOW = { timeout: 5000 };

const CATEGORIES = [
  { name: 'Groceries', contains: 'Grocer' },
  { name: 'Transport', contains: 'Taxi' },
  { name: 'Unused' },
];

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function chartRows(screen: Screen, chart: string) {
  return screen.getByRole('table', { name: chart }).getByRole('row');
}

async function expectHeader(screen: Screen, chart: string, columns: string[]) {
  const header = chartRows(screen, chart).first();
  for (const [index, column] of columns.entries()) {
    await expect.element(header.getByRole('columnheader').nth(index)).toHaveTextContent(exactly(column));
  }
  await expect.element(header.getByRole('columnheader').nth(columns.length)).not.toBeInTheDocument();
}

async function expectChartRow(screen: Screen, chart: string, index: number, cells: string[]) {
  const [label = '', ...values] = cells;
  const row = chartRows(screen, chart).nth(index);
  await expect.element(row.getByRole('rowheader')).toHaveTextContent(exactly(label));
  for (const [column, value] of values.entries()) {
    await expect.element(row.getByRole('cell').nth(column)).toHaveTextContent(exactly(value));
  }
  await expect.element(row.getByRole('cell').nth(values.length)).not.toBeInTheDocument();
}

async function expectRowCount(screen: Screen, chart: string, count: number) {
  await expect.element(chartRows(screen, chart).nth(count - 1)).toBeInTheDocument();
  await expect.element(chartRows(screen, chart).nth(count)).not.toBeInTheDocument();
}

test("the spending chart plots each category's current value and mean", SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);

  await expectHeader(screen, 'Spending by category', ['Category', 'Current', 'Mean (6 months)']);
  await expectChartRow(screen, 'Spending by category', 1, ['Groceries', '120.00', '57.50']);
  await expectChartRow(screen, 'Spending by category', 2, ['Transport', '30.00', '7.50']);
  await expectRowCount(screen, 'Spending by category', 3);

  const period = screen.getByLabelText(/^Period$/);
  await period.selectOptions(period.getByRole('option', { name: '2025-06 (in progress)' }));

  await expectChartRow(screen, 'Spending by category', 1, ['Groceries', '40.00', '70.00']);
  await expectChartRow(screen, 'Spending by category', 2, ['Transport', '0.00', '12.00']);
  await expectRowCount(screen, 'Spending by category', 3);
});

test('the income chart plots the income categories', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);

  const screen = await render(DashboardView);

  await expectChartRow(screen, 'Spending by category', 1, ['Groceries', '110.00', '57.50']);
  await expectChartRow(screen, 'Spending by category', 2, ['Transport', '30.00', '7.50']);
  await expectChartRow(screen, 'Spending by category', 3, ['Uncategorized', '7.00', '0.00']);
  await expectRowCount(screen, 'Spending by category', 4);

  await screen.getByRole('tab', { name: 'Income' }).click();

  await expect
    .element(screen.getByRole('table', { name: 'Spending by category' }))
    .not.toBeInTheDocument();
  await expectHeader(screen, 'Income by category', ['Category', 'Current', 'Mean (6 months)']);
  await expectChartRow(screen, 'Income by category', 1, ['Salary', '1500.00', '750.00']);
  await expectChartRow(screen, 'Income by category', 2, ['Uncategorized', '5.00', '0.00']);
  await expectRowCount(screen, 'Income by category', 3);
});

test('without a baseline the chart plots only the current values', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows([
    ['10/03/2025', 'Grocer Mar', -80],
    ['10/05/2025', 'Grocer May', -120],
  ]);
  await categorize([{ name: 'Groceries', contains: 'Grocer' }]);

  const screen = await render(DashboardView);

  await expectHeader(screen, 'Spending by category', ['Category', 'Current']);
  await expectChartRow(screen, 'Spending by category', 1, ['Groceries', '120.00']);
  await expectRowCount(screen, 'Spending by category', 2);
});

test('a tab with no category rows has no chart', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MONTHS);
  await categorize(CATEGORIES);

  const screen = await render(DashboardView);
  await screen.getByRole('tab', { name: 'Income' }).click();

  await expect.element(screen.getByRole('table', { name: 'Income comparison' })).toBeVisible();
  await expect
    .element(screen.getByRole('table', { name: 'Income by category' }))
    .not.toBeInTheDocument();
});

test('the monthly chart plots every month of the history', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);

  const screen = await render(DashboardView);
  const chart = 'Monthly spending and income';

  await expectHeader(screen, chart, ['Month', 'Spending', 'Income']);
  await expectChartRow(screen, chart, 1, ['2025-01', '120.00', '0.00']);
  await expectChartRow(screen, chart, 2, ['2025-02', '50.00', '0.00']);
  await expectChartRow(screen, chart, 3, ['2025-03', '90.00', '1500.00']);
  await expectChartRow(screen, chart, 4, ['2025-04', '0.00', '1500.00']);
  await expectChartRow(screen, chart, 5, ['2025-05', '147.00', '1505.00']);
  await expectChartRow(screen, chart, 6, ['2025-06 (in progress)', '40.00', '0.00']);
  await expectRowCount(screen, chart, 7);
  await expect.element(screen.getByText(/excluded from monthly totals/)).not.toBeInTheDocument();

  const periodType = screen.getByLabelText(/^Period type$/);
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Year' }));
  await expect.element(screen.getByLabelText(/^Period$/)).toHaveDisplayValue('2025 (in progress)');

  await expectChartRow(screen, chart, 1, ['2025-01', '120.00', '0.00']);
  await expectChartRow(screen, chart, 5, ['2025-05', '147.00', '1505.00']);
  await expectRowCount(screen, chart, 7);
});

test('the monthly chart counts the rows it leaves out for missing rates', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MISSING_RATE_SHORT_POOL, MIXED_OPTIONS);
  await categorize([{ name: 'Groceries', contains: 'Grocer' }]);

  const screen = await render(DashboardView);
  const chart = 'Monthly spending and income';

  await expect
    .element(screen.getByText('1 transaction excluded from totals: no exchange rate.'))
    .toBeVisible();
  await expect
    .element(screen.getByText('2 transactions excluded from monthly totals: no exchange rate.'))
    .toBeVisible();
  await expectChartRow(screen, chart, 1, ['2025-03', '80.00', '0.00']);
  await expectChartRow(screen, chart, 2, ['2025-04', '0.00', '0.00']);
  await expectChartRow(screen, chart, 3, ['2025-05', '120.00', '0.00']);
  await expectChartRow(screen, chart, 4, ['2025-06 (in progress)', '0.00', '0.00']);
  await expectRowCount(screen, chart, 5);
});
