import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import { categorize } from './helpers/categorize';
import { MIXED, MIXED_CATEGORIES, MIXED_OPTIONS } from './helpers/dashboardData';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';

type Screen = Awaited<ReturnType<typeof render>>;

const SLOW = { timeout: 5000 };

async function openDashboard(): Promise<Screen> {
  freezeDate('2025-06-15T12:00:00');
  await importRows(MIXED, MIXED_OPTIONS);
  await categorize(MIXED_CATEGORIES);
  location.hash = '#/dashboard';
  const screen = await render(App);
  await expect.element(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return screen;
}

async function choose(screen: Screen, label: RegExp | string, option: string) {
  const select = screen.getByRole('combobox', { name: label });
  await select.selectOptions(select.getByRole('option', { name: option }));
}

function transactionRows(screen: Screen) {
  return screen.getByRole('table', { name: 'Transactions' }).getByRole('row');
}

async function expectTransactionsFilters(screen: Screen, period: string, category: string) {
  await expect.element(screen.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect
    .element(screen.getByRole('combobox', { name: /^Period$/ }))
    .toHaveDisplayValue(period);
  await expect
    .element(screen.getByRole('combobox', { name: /^Category$/ }))
    .toHaveDisplayValue(category);
}

test('a category row opens Transactions filtered to it, and Back restores the Dashboard', SLOW, async () => {
  const screen = await openDashboard();
  await choose(screen, /^Period$/, '2025-03');
  await choose(screen, /^Baseline$/, 'Median');

  await screen.getByRole('link', { name: /^Groceries$/ }).click();

  await expectTransactionsFilters(screen, '2025-03', 'Groceries');
  await expect.element(transactionRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Grocer Mar$/ })).toBeVisible();

  history.back();

  await expect.element(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect
    .element(screen.getByRole('combobox', { name: /^Period$/ }))
    .toHaveDisplayValue('2025-03');
  await expect
    .element(screen.getByRole('combobox', { name: /^Baseline$/ }))
    .toHaveDisplayValue('Median');
});

test('a quarter drill-down restores the period type on Back', SLOW, async () => {
  const screen = await openDashboard();
  await choose(screen, /^Period type$/, 'Quarter');
  await choose(screen, /^Period$/, '2025 Q1');

  await screen.getByRole('link', { name: /^Groceries$/ }).click();

  await expectTransactionsFilters(screen, '2025 Q1', 'Groceries');
  await expect.element(transactionRows(screen)).toHaveLength(4);
  await expect.element(screen.getByRole('cell', { name: /^Grocer Jan$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Grocer Feb$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Grocer Mar$/ })).toBeVisible();

  history.back();

  await expect.element(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect
    .element(screen.getByRole('combobox', { name: /^Period type$/ }))
    .toHaveDisplayValue('Quarter');
  await expect
    .element(screen.getByRole('combobox', { name: /^Period$/ }))
    .toHaveDisplayValue('2025 Q1');
});

test('uncategorized drills to both signs, and Back restores the Income tab', SLOW, async () => {
  const screen = await openDashboard();
  await choose(screen, /^Period$/, '2025-05');
  await screen.getByRole('tab', { name: 'Income' }).click();

  await screen.getByRole('link', { name: /^Uncategorized$/ }).click();

  await expectTransactionsFilters(screen, '2025-05', 'Uncategorized');
  await expect.element(transactionRows(screen)).toHaveLength(3);
  await expect.element(screen.getByRole('cell', { name: /^Mystery out$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Mystery in$/ })).toBeVisible();

  history.back();

  await expect
    .element(screen.getByRole('tab', { name: 'Income' }))
    .toHaveAttribute('aria-selected', 'true');
  await expect.element(screen.getByRole('table', { name: 'Income comparison' })).toBeVisible();
});

test('the total row opens the period unfiltered by category', SLOW, async () => {
  const screen = await openDashboard();
  await choose(screen, /^Period$/, '2025-05');

  await screen.getByRole('link', { name: /^Total spending$/ }).click();

  await expectTransactionsFilters(screen, '2025-05', 'All categories');
  await expect.element(transactionRows(screen)).toHaveLength(11);
  await expect.element(screen.getByRole('cell', { name: /^Savings May$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Hidden May$/ })).toBeVisible();
  await expect
    .element(screen.getByRole('table', { name: 'Transactions' }).getByText(/^paired$/))
    .toHaveLength(2);
});

test('a row with only a baseline drills into an empty period', SLOW, async () => {
  const screen = await openDashboard();
  await choose(screen, /^Period$/, '2025-04');

  await screen.getByRole('link', { name: /^Groceries$/ }).click();

  await expect
    .element(screen.getByRole('combobox', { name: /^Period$/ }))
    .toHaveDisplayValue('2025-04');
  await expect.element(screen.getByText('No transactions match the filters.')).toBeVisible();
});
