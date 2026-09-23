import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

const ALPHA: StatementCell[] = ['16/03/2025', 'Alpha payment', -30];
const BETA: StatementCell[] = ['14/03/2025', 'Beta payment', -10];
const GAMMA: StatementCell[] = ['15/03/2025', 'Gamma payment', -20];

function bodyRows(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole('table', { name: 'Transactions' }).getByRole('row');
}

test('an empty database shows an empty state, not an empty table', async () => {
  const screen = await render(TransactionsView);

  await expect.element(screen.getByText('No transactions yet. Import a statement to get started.')).toBeVisible();
});

test('a confirmed import appears in the Transactions table', async () => {
  await importRows([BETA, GAMMA]);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: 'Beta payment' })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: '-10.00 GEL' })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: '2025-03-15' }).first()).toBeVisible();
});

test('imported data survives a remount', async () => {
  await importRows([BETA]);

  let screen = await render(App);
  await screen.getByRole('link', { name: 'Transactions' }).click();
  await expect.element(screen.getByRole('cell', { name: 'Beta payment' })).toBeVisible();

  screen = await remount(App);
  await screen.getByRole('link', { name: 'Transactions' }).click();
  await expect.element(screen.getByRole('cell', { name: 'Beta payment' })).toBeVisible();
});

test('two identical rows in one file are stored as two separate transactions', async () => {
  await importRows([BETA, BETA]);
  const screen = await render(TransactionsView);

  await expect.element(bodyRows(screen)).toHaveLength(3);
  await expect.element(bodyRows(screen).nth(1)).toHaveTextContent('Beta payment');
  await expect.element(bodyRows(screen).nth(2)).toHaveTextContent('Beta payment');
});

test('the counterparty column shows the counterparty, not the raw details', async () => {
  await importRows([['17/03/2025', 'Payment - Amount GEL5.00; Payment Fee, Bank Mu', -5]]);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^Bank Mu$/ })).toBeVisible();
});

test('rows are newest first by effective date until a column is chosen', async () => {
  await importRows([BETA, GAMMA, ALPHA]);
  const screen = await render(TransactionsView);

  await expect.element(bodyRows(screen).nth(1)).toHaveTextContent('Alpha payment');
  await expect.element(bodyRows(screen).nth(2)).toHaveTextContent('Gamma payment');
  await expect.element(bodyRows(screen).nth(3)).toHaveTextContent('Beta payment');
});

test('sorting by counterparty orders rows alphabetically, and reverses on a second click', async () => {
  await importRows([GAMMA, ALPHA, BETA]);
  const screen = await render(TransactionsView);

  await screen.getByRole('button', { name: 'Counterparty' }).click();
  await expect.element(bodyRows(screen).nth(1)).toHaveTextContent('Alpha payment');
  await expect.element(bodyRows(screen).nth(3)).toHaveTextContent('Gamma payment');

  await screen.getByRole('button', { name: 'Counterparty' }).click();
  await expect.element(bodyRows(screen).nth(1)).toHaveTextContent('Gamma payment');
  await expect.element(bodyRows(screen).nth(3)).toHaveTextContent('Alpha payment');
});

test('sorting by amount orders by value, not by text', async () => {
  await importRows([BETA, GAMMA, ALPHA]);
  const screen = await render(TransactionsView);

  await screen.getByRole('button', { name: 'Amount' }).click();

  await expect.element(bodyRows(screen).nth(1)).toHaveTextContent('-30.00 GEL');
  await expect.element(bodyRows(screen).nth(2)).toHaveTextContent('-20.00 GEL');
  await expect.element(bodyRows(screen).nth(3)).toHaveTextContent('-10.00 GEL');
});

test('sorting by posting date marks the chosen column for assistive technology', async () => {
  await importRows([BETA, GAMMA]);
  const screen = await render(TransactionsView);

  await screen.getByRole('button', { name: 'Posting date' }).click();

  await expect
    .element(screen.getByRole('columnheader', { name: 'Posting date' }))
    .toHaveAttribute('aria-sort', 'ascending');
  await expect
    .element(screen.getByRole('columnheader', { name: 'Effective date' }))
    .toHaveAttribute('aria-sort', 'none');
});

test('sorting by kind groups the rows by their Details kind', async () => {
  await importRows([BETA, ['17/03/2025', 'Payment - Amount GEL5.00; Payment Fee, Bank Mu', -5]]);
  const screen = await render(TransactionsView);

  await screen.getByRole('button', { name: 'Kind' }).click();

  await expect.element(bodyRows(screen).nth(1)).toHaveTextContent('fee');
  await expect.element(bodyRows(screen).nth(2)).toHaveTextContent('other');
});
