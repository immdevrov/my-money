import { expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import CategoriesView from '../src/ui/views/CategoriesView.svelte';
import RulesView from '../src/ui/views/RulesView.svelte';
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

const SHOP_BETA_MCC1001: StatementCell[] = [
  '17/03/2025',
  'Payment - Amount: GEL13.00; Merchant: Shop Beta, Tbilisi; MCC:1001; Date: 17/03/2025 10:00; Card No: ****2222',
  -13,
  null,
];

const UNPAIRED_CONVERSION: StatementCell[] = [
  '11/02/2025',
  'Payment - Amount USD30.00; Foreign Exchange. FX Rate:3.1',
  null,
  -30,
];

type Screen = Awaited<ReturnType<typeof render>>;

async function addCategory(screen: Screen, name: string, type: 'expense' | 'transfer' = 'expense') {
  await screen.getByLabelText('Name').fill(name);
  if (type !== 'expense') {
    const typeSelect = screen.getByLabelText('Type');
    await typeSelect.selectOptions(typeSelect.getByRole('option', { name: type }));
  }
  await screen.getByRole('button', { name: 'Save category' }).click();
}

async function addRule(
  screen: Screen,
  options: { field?: 'counterparty' | 'mcc' | 'details' | 'kind'; pattern: string; category: string },
) {
  if (options.field) {
    const fieldSelect = screen.getByLabelText('Field');
    await fieldSelect.selectOptions(fieldSelect.getByRole('option', { name: options.field }));
  }
  await screen.getByLabelText('Pattern').fill(options.pattern);
  const categorySelect = screen.getByLabelText('Category');
  await categorySelect.selectOptions(categorySelect.getByRole('option', { name: options.category }));
  await screen.getByRole('button', { name: 'Save rule' }).click();
}

test('a paired conversion shows Currency conversion with no select, and every other row starts uncategorized', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, SHOP_ALPHA], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^Currency conversion$/ })).toHaveLength(4);
  await expect
    .element(screen.getByRole('table', { name: 'Transactions' }).getByRole('combobox'))
    .toHaveLength(1);

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

test('a rule matches case-insensitively', async () => {
  await importRows([SHOP_ALPHA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'shop alpha', category: 'Groceries' });
  cleanup();

  screen = await render(TransactionsView);
  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^rule$/)).toBeVisible();
});

test('a manual assignment survives a rule that would otherwise match the row', async () => {
  await importRows([SHOP_BETA_MCC1001], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(CategoriesView);
  await addCategory(screen, 'Transfers out', 'transfer');
  cleanup();

  screen = await render(TransactionsView);
  const select = screen.getByRole('combobox', { name: 'Category for Shop Beta' });
  await select.selectOptions(select.getByRole('option', { name: /^Transfers out$/ }));
  await expect
    .element(screen.getByRole('option', { name: /^Transfers out$/, selected: true }))
    .toBeInTheDocument();
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { field: 'mcc', pattern: '1001', category: 'Groceries' });
  cleanup();

  screen = await render(TransactionsView);
  await expect
    .element(screen.getByRole('option', { name: /^Transfers out$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).toBeVisible();
});

test('no rule can recategorize a paired conversion, but an unpaired conversion follows rules', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, UNPAIRED_CONVERSION], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Transfers out', 'transfer');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { field: 'kind', pattern: 'conversion', category: 'Transfers out' });
  cleanup();

  screen = await render(TransactionsView);

  const gelRow = screen.getByRole('row', { name: /273\.50 GEL/ });
  const usdRow = screen.getByRole('row', { name: /-100\.00 USD/ });
  const unpairedRow = screen.getByRole('row', { name: /-30\.00 USD/ });

  await expect.element(gelRow.getByRole('cell', { name: /^Currency conversion$/ })).toHaveLength(2);
  await expect.element(usdRow.getByRole('cell', { name: /^Currency conversion$/ })).toHaveLength(2);
  await expect.element(gelRow.getByRole('combobox')).not.toBeInTheDocument();
  await expect.element(usdRow.getByRole('combobox')).not.toBeInTheDocument();

  await expect
    .element(unpairedRow.getByRole('option', { name: /^Transfers out$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(unpairedRow.getByText(/^rule$/)).toBeVisible();
});

test('resetting a manual category falls back to the rule that covers the row', async () => {
  await importRows([SHOP_ALPHA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(CategoriesView);
  await addCategory(screen, 'Snacks');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Groceries' });
  cleanup();

  screen = await render(TransactionsView);
  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await select.selectOptions(select.getByRole('option', { name: /^Snacks$/ }));
  await expect
    .element(screen.getByRole('option', { name: /^Snacks$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).toBeVisible();

  await screen.getByRole('button', { name: 'Reset category for Shop Alpha' }).click();

  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^rule$/)).toBeVisible();
});
