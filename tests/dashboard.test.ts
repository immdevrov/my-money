import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DashboardView from '../src/ui/views/DashboardView.svelte';
import { categorize } from './helpers/categorize';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';

type Screen = Awaited<ReturnType<typeof render>>;

const MONTHS: StatementCell[][] = [
  ['10/01/2025', 'Grocer Jan', -100],
  ['12/01/2025', 'Taxi Jan', -20],
  ['10/02/2025', 'Grocer Feb', -50],
  ['10/03/2025', 'Grocer Mar', -80],
  ['12/03/2025', 'Taxi Mar', -10],
  ['10/05/2025', 'Grocer May', -120],
  ['12/05/2025', 'Taxi May', -30],
  ['10/06/2025', 'Grocer Jun', -40],
];

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

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function spendingRows(screen: Screen) {
  return screen.getByRole('table', { name: 'Spending comparison' }).getByRole('row');
}

async function expectRow(screen: Screen, index: number, cells: string[]) {
  const [name = '', ...values] = cells;
  const row = spendingRows(screen).nth(index);
  await expect.element(row.getByRole('rowheader')).toHaveTextContent(exactly(name));
  for (const [column, value] of values.entries()) {
    await expect.element(row.getByRole('cell').nth(column)).toHaveTextContent(exactly(value));
  }
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
  const baseline = screen.getByLabelText('Baseline');

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
  const baseline = screen.getByLabelText('Baseline');
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));

  await expectRow(screen, 1, ['Groceries', '100.00', 'insufficient data', '', '']);
});

test('resets to the default quarter and compares against each baseline', async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows(QUARTERS);
  await categorize(GROCERIES);

  const screen = await render(DashboardView);
  const periodType = screen.getByLabelText('Period type');
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Quarter' }));

  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2025 Q1');

  await expectRow(screen, 1, ['Groceries', '40.00', '52.50', '-12.50', '-24%']);
  await expectRow(screen, 2, ['Total spending', '40.00', '52.50', '-12.50', '-24%']);

  const baseline = screen.getByLabelText('Baseline');
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
  const periodType = screen.getByLabelText('Period type');
  await periodType.selectOptions(periodType.getByRole('option', { name: 'Year' }));

  const period = screen.getByLabelText(/^Period$/);
  await expect.element(period).toHaveDisplayValue('2024');

  await expectRow(screen, 1, ['Groceries', '300.00', '116.67', '+183.33', '+157%']);
  await expectRow(screen, 2, ['Total spending', '300.00', '116.67', '+183.33', '+157%']);

  const baseline = screen.getByLabelText('Baseline');
  await baseline.selectOptions(baseline.getByRole('option', { name: 'Median' }));
  await expectRow(screen, 1, ['Groceries', '300.00', '100.00', '+200.00', '+200%']);
  await expectRow(screen, 2, ['Total spending', '300.00', '100.00', '+200.00', '+200%']);

  await baseline.selectOptions(baseline.getByRole('option', { name: 'Previous period' }));
  await expectRow(screen, 1, ['Groceries', '300.00', '0.00', '+300.00', '—']);
  await expectRow(screen, 2, ['Total spending', '300.00', '0.00', '+300.00', '—']);
});

test('an empty database shows the empty message', async () => {
  const screen = await render(DashboardView);

  await expect
    .element(screen.getByText('No transactions yet. Import a statement to see the dashboard.'))
    .toBeVisible();
  await expect.element(screen.getByLabelText(/^Period$/)).not.toBeInTheDocument();
  await expect.element(screen.getByRole('table')).not.toBeInTheDocument();
});
