import { expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import CategoriesView from '../src/ui/views/CategoriesView.svelte';
import RulesView from '../src/ui/views/RulesView.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

const SHOP_ALPHA: StatementCell[] = [
  '14/03/2025',
  'Payment - Amount: GEL10.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 14/03/2025 10:00; Card No: ****1111',
  -10,
];

const CASCADE_OPTIONS = { header: ['Date', 'Details', 'GEL', 'USD'] };

const CASCADE_SHOP_ALPHA_1: StatementCell[] = [
  '14/03/2025',
  'Payment - Amount: GEL10.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 14/03/2025 10:00; Card No: ****1111',
  -10,
  null,
];

const CASCADE_SHOP_ALPHA_2: StatementCell[] = [
  '15/03/2025',
  'Payment - Amount: GEL11.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 15/03/2025 10:00; Card No: ****1111',
  -11,
  null,
];

const CASCADE_SHOP_ALPHA_3: StatementCell[] = [
  '16/03/2025',
  'Payment - Amount: GEL12.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 16/03/2025 10:00; Card No: ****1111',
  -12,
  null,
];

const CASCADE_SHOP_BETA: StatementCell[] = [
  '17/03/2025',
  'Payment - Amount: GEL13.00; Merchant: Shop Beta, Tbilisi; MCC:1001; Date: 17/03/2025 10:00; Card No: ****2222',
  -13,
  null,
];

function tableRows(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole('table', { name: 'Categories' }).getByRole('row');
}

async function addCategory(
  screen: Awaited<ReturnType<typeof render>>,
  name: string,
  colourName?: string,
) {
  await screen.getByLabelText('Name').fill(name);
  if (colourName) {
    await screen
      .getByLabelText('Colour')
      .selectOptions(screen.getByRole('option', { name: colourName }));
  }
  await screen.getByRole('button', { name: 'Save category' }).click();
}

async function addRule(
  screen: Awaited<ReturnType<typeof render>>,
  options: { pattern: string; category: string },
) {
  await screen.getByLabelText('Pattern').fill(options.pattern);
  const categorySelect = screen.getByLabelText('Category');
  await categorySelect.selectOptions(categorySelect.getByRole('option', { name: options.category }));
  await screen.getByRole('button', { name: 'Save rule' }).click();
}

test('adding a category lists it with its type and colour', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries', 'Teal');

  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^expense$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /Teal/ })).toBeVisible();
});

test('a fresh database seeds exactly one category, Currency conversion', async () => {
  const screen = await render(CategoriesView);

  await expect.element(tableRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Currency conversion$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^transfer$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /Grey/ })).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Delete Currency conversion' }))
    .not.toBeInTheDocument();
});

test('an empty name and a duplicate name are rejected with their messages', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries');
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();

  await screen.getByLabelText('Name').fill('');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect.element(screen.getByText('Name is required.')).toBeVisible();

  await screen.getByLabelText('Name').fill('groceries ');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect
    .element(screen.getByText('A category with this name already exists.'))
    .toBeVisible();
});

test('renaming a category in the view updates its row', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries');
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();

  await screen.getByRole('button', { name: 'Edit Groceries' }).click();
  await screen.getByLabelText('Name').fill('Produce');
  await screen.getByRole('button', { name: 'Save category' }).click();

  await expect.element(screen.getByRole('cell', { name: /^Produce$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).not.toBeInTheDocument();
});

test('seeding runs once: a renamed Currency conversion keeps its name after a remount', async () => {
  let screen = await render(App);
  await screen.getByRole('link', { name: 'Categories' }).click();

  await screen.getByRole('button', { name: 'Edit Currency conversion' }).click();
  await screen.getByLabelText('Name').fill('FX');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect.element(screen.getByRole('cell', { name: /^FX$/ })).toBeVisible();

  screen = await remount(App);
  await screen.getByRole('link', { name: 'Categories' }).click();

  await expect.element(screen.getByRole('cell', { name: /^FX$/ })).toBeVisible();
  await expect
    .element(screen.getByRole('cell', { name: /^Currency conversion$/ }))
    .not.toBeInTheDocument();
});

test('deleting a category with no rules or manual assignments confirms with zero counts and removes the row', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries');
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();

  await screen.getByRole('button', { name: 'Delete Groceries' }).click();
  await expect
    .element(screen.getByText('Delete Groceries? 0 rules and 0 manual assignments will be removed.'))
    .toBeVisible();

  await screen.getByRole('button', { name: /^Delete$/ }).click();
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).not.toBeInTheDocument();
});

test('renaming a category in CategoriesView changes the name a transaction row shows', async () => {
  await importRows([SHOP_ALPHA]);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');

  cleanup();
  screen = await render(TransactionsView);
  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await select.selectOptions(select.getByRole('option', { name: /^Groceries$/ }));
  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();

  cleanup();
  screen = await render(CategoriesView);
  await screen.getByRole('button', { name: 'Edit Groceries' }).click();
  await screen.getByLabelText('Name').fill('Produce');
  await screen.getByRole('button', { name: 'Save category' }).click();

  cleanup();
  screen = await render(TransactionsView);
  await expect
    .element(screen.getByRole('option', { name: /^Produce$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByRole('option', { name: /^Groceries$/ })).not.toBeInTheDocument();
});

test('deleting a category cascades to its rule and manual assignments, leaving the rows uncategorized', async () => {
  await importRows(
    [CASCADE_SHOP_ALPHA_1, CASCADE_SHOP_ALPHA_2, CASCADE_SHOP_ALPHA_3, CASCADE_SHOP_BETA],
    CASCADE_OPTIONS,
  );

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Groceries' });
  cleanup();

  screen = await render(TransactionsView);
  const betaSelect = screen.getByRole('combobox', { name: 'Category for Shop Beta' });
  await betaSelect.selectOptions(betaSelect.getByRole('option', { name: /^Groceries$/ }));
  await expect
    .element(screen.getByRole('button', { name: 'Reset category for Shop Beta' }))
    .toBeVisible();
  cleanup();

  screen = await render(CategoriesView);
  await screen.getByRole('button', { name: 'Delete Groceries' }).click();
  await expect
    .element(screen.getByText('Delete Groceries? 1 rule and 1 manual assignment will be removed.'))
    .toBeVisible();

  await screen.getByRole('button', { name: /^Delete$/ }).click();
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).not.toBeInTheDocument();
  cleanup();

  screen = await render(RulesView);
  await expect
    .element(screen.getByText('No rules yet. Pick a category on a transaction to create one.'))
    .toBeVisible();
  cleanup();

  screen = await render(TransactionsView);
  await expect.element(screen.getByText(/^rule$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).not.toBeInTheDocument();
});
