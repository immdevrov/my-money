import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import { importRows } from './helpers/importRows';

const VIEWS = ['Import', 'Transactions', 'Rules', 'Categories', 'Dashboard', 'Settings'];

test('every view is reachable from the navigation', async () => {
  const screen = await render(App);

  for (const name of VIEWS) {
    await expect.element(screen.getByRole('link', { name })).toBeVisible();
  }
});

test('the import view is shown by default', async () => {
  const screen = await render(App);

  await expect.element(screen.getByRole('heading', { name: 'Import' })).toBeVisible();
});

test('navigating marks the active link and swaps the view', async () => {
  const screen = await render(App);

  await screen.getByRole('link', { name: 'Transactions' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect
    .element(screen.getByText('No transactions yet. Import a statement to get started.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Transactions' }))
    .toHaveAttribute('aria-current', 'page');
});

async function openFilteredTransactions() {
  await importRows([
    ['15/01/2025', 'Alpha payment', -1],
    ['05/01/2024', 'Delta payment', -4],
  ]);
  location.hash = '#/transactions?period=2024';
  return await render(App);
}

function bodyRows(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole('table', { name: 'Transactions' }).getByRole('row');
}

test('a URL with filters opens Transactions filtered', async () => {
  const screen = await openFilteredTransactions();

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Delta payment$/ })).toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Transactions' }))
    .toHaveAttribute('aria-current', 'page');
});

test('the Transactions nav link clears filters', async () => {
  const screen = await openFilteredTransactions();
  await expect.element(bodyRows(screen)).toHaveLength(2);

  await screen.getByRole('link', { name: 'Transactions' }).click();

  await expect
    .element(screen.getByRole('combobox', { name: 'Period' }))
    .toHaveDisplayValue('All periods');
  await expect.element(bodyRows(screen)).toHaveLength(3);
  await expect.element(screen.getByRole('cell', { name: /^Alpha payment$/ })).toBeVisible();
});
