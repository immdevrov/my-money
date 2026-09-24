import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';

const ALPHA: StatementCell[] = ['15/01/2025', 'Alpha payment', -1];
const BETA: StatementCell[] = ['20/02/2025', 'Beta payment', -2];
const GAMMA: StatementCell[] = ['10/04/2025', 'Gamma payment', -3];
const DELTA: StatementCell[] = ['05/01/2024', 'Delta payment', -4];
const FEE: StatementCell[] = [
  '17/03/2025',
  'Payment - Amount GEL5.00; Payment Fee, 17/03/2025 , payment service, Bank Mu, Subscriber number 1, payment code - 1',
  -5,
];

const ALL = [ALPHA, BETA, GAMMA, DELTA, FEE];

function bodyRows(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole('table', { name: 'Transactions' }).getByRole('row');
}

async function assignGroceries(screen: Awaited<ReturnType<typeof render>>, counterparty: string) {
  const select = screen.getByRole('combobox', { name: `Category for ${counterparty}` });
  await select.selectOptions(select.getByRole('option', { name: /^New category…$/ }));
  await screen.getByLabelText('Name').fill('Groceries');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await screen.getByRole('button', { name: 'No' }).click();
}

test('period filter narrows to a year', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  const period = screen.getByRole('combobox', { name: 'Period' });
  await period.selectOptions(period.getByRole('option', { name: /^2024$/ }));

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Delta payment$/ })).toBeVisible();
});

test('period filter narrows to a quarter', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  const period = screen.getByRole('combobox', { name: 'Period' });
  await period.selectOptions(period.getByRole('option', { name: /^2025 Q1$/ }));

  await expect.element(bodyRows(screen)).toHaveLength(4);
  await expect.element(screen.getByRole('cell', { name: /^Alpha payment$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Beta payment$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Bank Mu$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Gamma payment$/ })).not.toBeInTheDocument();
});

test('period filter narrows to a month', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  const period = screen.getByRole('combobox', { name: 'Period' });
  await period.selectOptions(period.getByRole('option', { name: /^2025-02$/ }));

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Beta payment$/ })).toBeVisible();
});

test('category filter narrows to a manually assigned category', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);
  await assignGroceries(screen, 'Alpha payment');

  const category = screen.getByRole('combobox', { name: /^Category$/ });
  await category.selectOptions(category.getByRole('option', { name: /^Groceries$/ }));

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Alpha payment$/ })).toBeVisible();
});

test('category filter "Uncategorized" excludes the manually assigned row', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);
  await assignGroceries(screen, 'Alpha payment');

  const category = screen.getByRole('combobox', { name: /^Category$/ });
  await category.selectOptions(category.getByRole('option', { name: /^Uncategorized$/ }));

  await expect.element(bodyRows(screen)).toHaveLength(5);
  await expect.element(screen.getByRole('cell', { name: /^Alpha payment$/ })).not.toBeInTheDocument();
});

test('kind filter narrows to one Details kind', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  const kind = screen.getByRole('combobox', { name: 'Kind' });
  await kind.selectOptions(kind.getByRole('option', { name: /^fee$/ }));

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Bank Mu$/ })).toBeVisible();
});

test('search matches the counterparty case-insensitively', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  await screen.getByRole('searchbox', { name: 'Search' }).fill('BETA');

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Beta payment$/ })).toBeVisible();
});

test('search matches a counterparty derived from details', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  await screen.getByRole('searchbox', { name: 'Search' }).fill('bank mu');

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Bank Mu$/ })).toBeVisible();
});

test('search matches raw details text not present in the counterparty', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  await screen.getByRole('searchbox', { name: 'Search' }).fill('payment code');

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Bank Mu$/ })).toBeVisible();
});

test('period and search filters combine with AND to narrow further', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  const period = screen.getByRole('combobox', { name: 'Period' });
  await period.selectOptions(period.getByRole('option', { name: /^2025$/ }));
  await screen.getByRole('searchbox', { name: 'Search' }).fill('gamma');

  await expect.element(bodyRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Gamma payment$/ })).toBeVisible();
});

test('combined filters with no match show a distinct message, and the filter bar stays', async () => {
  await importRows(ALL);
  const screen = await render(TransactionsView);

  const period = screen.getByRole('combobox', { name: 'Period' });
  await period.selectOptions(period.getByRole('option', { name: /^2024$/ }));
  await screen.getByRole('searchbox', { name: 'Search' }).fill('gamma');

  await expect.element(screen.getByText('No transactions match the filters.')).toBeVisible();
  await expect
    .element(screen.getByText('No transactions yet. Import a statement to get started.'))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole('combobox', { name: 'Period' })).toBeVisible();
});

test('an empty database keeps its own message and no filter bar', async () => {
  const screen = await render(TransactionsView);

  await expect
    .element(screen.getByText('No transactions yet. Import a statement to get started.'))
    .toBeVisible();
  await expect.element(screen.getByRole('combobox', { name: 'Period' })).not.toBeInTheDocument();
});
