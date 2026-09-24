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
  const period = screen.getByLabelText('Period');
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

  const period = screen.getByLabelText('Period');
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

  await expect.element(screen.getByLabelText('Period')).toHaveDisplayValue('2025-05');
  await expectRow(screen, 1, ['Groceries', '120.00', 'insufficient data', '', '']);
  await expectRow(screen, 2, ['Total spending', '120.00', 'insufficient data', '', '']);
});

test('an empty database shows the empty message', async () => {
  const screen = await render(DashboardView);

  await expect
    .element(screen.getByText('No transactions yet. Import a statement to see the dashboard.'))
    .toBeVisible();
  await expect.element(screen.getByLabelText('Period')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('table')).not.toBeInTheDocument();
});
