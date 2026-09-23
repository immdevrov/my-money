import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

const OPTIONS = { header: ['Date', 'Details', 'GEL', 'USD'] };

const CONVERSION_GEL: StatementCell[] = [
  '10/02/2025',
  'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.',
  273.5,
  null,
];

const CONVERSION_USD: StatementCell[] = [
  '10/02/2025',
  'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735',
  null,
  -100,
];

const SHOP_ALPHA: StatementCell[] = [
  '14/03/2025',
  'Payment - Amount: GEL10.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 14/03/2025 10:00; Card No: ****1111',
  -10,
  null,
];

const SHOP_BETA: StatementCell[] = [
  '15/03/2025',
  'Payment - Amount: GEL5.00; Merchant: Shop Beta, Tbilisi; MCC:1002; Date: 15/03/2025 10:00; Card No: ****2222',
  -5,
  null,
];

test('a paired conversion shows Currency conversion with no select, and every other row starts uncategorized', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, SHOP_ALPHA], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^Currency conversion$/ })).toHaveLength(4);
  await expect.element(screen.getByRole('combobox')).toHaveLength(1);

  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await expect.element(select).toHaveValue('uncategorized');
  await expect.element(screen.getByText(/^manual$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^rule$/)).not.toBeInTheDocument();
});

test('"New category…" assigns the category as manual and offers it in every row\'s select', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, SHOP_ALPHA, SHOP_BETA], OPTIONS);
  const screen = await render(TransactionsView);

  const alphaSelect = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await alphaSelect.selectOptions(alphaSelect.getByRole('option', { name: 'New category…' }));
  await screen.getByLabelText('Name').fill('Groceries');
  await screen.getByRole('button', { name: 'Save category' }).click();

  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Reset category for Shop Alpha' }))
    .toBeVisible();

  const betaRow = screen.getByRole('row', { name: /Shop Beta/ });
  await expect.element(betaRow.getByRole('option', { name: /^Groceries$/ })).toBeInTheDocument();
});

test('a manual category survives a remount', async () => {
  await importRows([SHOP_ALPHA]);

  let screen = await render(App);
  await screen.getByRole('link', { name: 'Transactions' }).click();

  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await select.selectOptions(screen.getByRole('option', { name: 'New category…' }));
  await screen.getByLabelText('Name').fill('Groceries');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();

  screen = await remount(App);
  await screen.getByRole('link', { name: 'Transactions' }).click();

  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).toBeVisible();
});

test('cancelling "New category…" leaves the row uncategorized', async () => {
  await importRows([SHOP_ALPHA]);
  const screen = await render(TransactionsView);

  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await select.selectOptions(select.getByRole('option', { name: 'New category…' }));
  await expect.element(screen.getByLabelText('Name')).toBeVisible();

  await screen.getByRole('button', { name: 'Cancel' }).click();

  await expect.element(select).toHaveValue('uncategorized');
  await expect.element(screen.getByText(/^manual$/)).not.toBeInTheDocument();
});

test('"Reset category" returns the row to Uncategorized and the button disappears', async () => {
  await importRows([SHOP_ALPHA]);
  const screen = await render(TransactionsView);

  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await select.selectOptions(screen.getByRole('option', { name: 'New category…' }));
  await screen.getByLabelText('Name').fill('Groceries');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect
    .element(screen.getByRole('button', { name: 'Reset category for Shop Alpha' }))
    .toBeVisible();

  await screen.getByRole('button', { name: 'Reset category for Shop Alpha' }).click();

  await expect.element(select).toHaveValue('uncategorized');
  await expect
    .element(screen.getByRole('button', { name: 'Reset category for Shop Alpha' }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).not.toBeInTheDocument();
});
