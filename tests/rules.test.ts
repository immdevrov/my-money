import { expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import CategoriesView from '../src/ui/views/CategoriesView.svelte';
import RulesView from '../src/ui/views/RulesView.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';

const OPTIONS = { header: ['Date', 'Details', 'GEL', 'USD'] };

const SHOP_ALPHA_1: StatementCell[] = [
  '14/03/2025',
  'Payment - Amount: GEL10.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 14/03/2025 10:00; Card No: ****1111',
  -10,
  null,
];

const SHOP_ALPHA_2: StatementCell[] = [
  '15/03/2025',
  'Payment - Amount: GEL11.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 15/03/2025 10:00; Card No: ****1111',
  -11,
  null,
];

const SHOP_ALPHA_3: StatementCell[] = [
  '16/03/2025',
  'Payment - Amount: GEL12.00; Merchant: Shop Alpha, Tbilisi; MCC:1001; Date: 16/03/2025 10:00; Card No: ****1111',
  -12,
  null,
];

const SHOP_BETA: StatementCell[] = [
  '17/03/2025',
  'Payment - Amount: GEL13.00; Merchant: Shop Beta, Tbilisi; MCC:1001; Date: 17/03/2025 10:00; Card No: ****2222',
  -13,
  null,
];

type Screen = Awaited<ReturnType<typeof render>>;

async function addCategory(screen: Screen, name: string) {
  await screen.getByLabelText('Name').fill(name);
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

test('the rules route renders RulesView', async () => {
  const screen = await render(App);

  await screen.getByRole('link', { name: 'Rules' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Rules' })).toBeVisible();
  await expect
    .element(screen.getByText('No rules yet. Pick a category on a transaction to create one.'))
    .toBeVisible();
});

test('adding a counterparty rule categorizes every matching row and shows its match count', async () => {
  await importRows([SHOP_ALPHA_1, SHOP_ALPHA_2, SHOP_ALPHA_3, SHOP_BETA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Groceries' });

  const rows = screen.getByRole('table', { name: 'Rules' }).getByRole('row');
  await expect.element(rows).toHaveLength(2);
  const ruleRow = screen.getByRole('row', { name: /Shop Alpha/ });
  await expect.element(ruleRow.getByRole('cell', { name: /^3$/ })).toBeVisible();
  cleanup();

  screen = await render(TransactionsView);
  await expect.element(screen.getByText(/^rule$/)).toHaveLength(3);
  const betaSelect = screen.getByRole('combobox', { name: 'Category for Shop Beta' });
  await expect.element(betaSelect).toHaveValue('uncategorized');
});

test('a new rule is listed first and its matches take priority over an older rule', async () => {
  await importRows([SHOP_ALPHA_1, SHOP_ALPHA_2, SHOP_ALPHA_3, SHOP_BETA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Groceries' });
  await addRule(screen, { field: 'mcc', pattern: '1001', category: 'Groceries' });

  const rows = screen.getByRole('table', { name: 'Rules' }).getByRole('row');
  await expect.element(rows).toHaveLength(3);

  await expect.element(rows.nth(1)).toHaveTextContent('mcc');
  await expect.element(rows.nth(1).getByRole('cell', { name: /^1$/ })).toBeVisible();
  await expect.element(rows.nth(1).getByRole('cell', { name: /^4$/ })).toBeVisible();

  await expect.element(rows.nth(2)).toHaveTextContent('counterparty');
  await expect.element(rows.nth(2).getByRole('cell', { name: /^2$/ })).toBeVisible();
  await expect.element(rows.nth(2).getByRole('cell', { name: /^0$/ })).toBeVisible();

  await addRule(screen, { field: 'details', pattern: 'Card No', category: 'Groceries' });

  await expect.element(rows).toHaveLength(4);
  await expect.element(rows.nth(1)).toHaveTextContent('details');
  await expect.element(rows.nth(2)).toHaveTextContent('mcc');
  await expect.element(rows.nth(3)).toHaveTextContent('counterparty');
});

test('moving a rule down changes which rule wins and updates its match count', async () => {
  await importRows([SHOP_ALPHA_1, SHOP_ALPHA_2, SHOP_ALPHA_3, SHOP_BETA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Transfers out');
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Transfers out' });
  await addRule(screen, { field: 'mcc', pattern: '1001', category: 'Groceries' });

  let rows = screen.getByRole('table', { name: 'Rules' }).getByRole('row');
  await expect.element(rows.nth(1)).toHaveTextContent('mcc');
  await expect.element(rows.nth(2)).toHaveTextContent('counterparty');
  await expect.element(rows.nth(1).getByRole('cell').nth(5)).toHaveTextContent('4');
  await expect.element(rows.nth(2).getByRole('cell').nth(5)).toHaveTextContent('0');

  await expect
    .element(screen.getByRole('button', { name: /^Move rule mcc equals 1001 up$/ }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole('button', { name: /^Move rule counterparty equals Shop Alpha down$/ }))
    .toBeDisabled();
  cleanup();

  screen = await render(TransactionsView);
  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toHaveLength(4);
  await expect
    .element(screen.getByRole('option', { name: /^Transfers out$/, selected: true }))
    .toHaveLength(0);
  cleanup();

  screen = await render(RulesView);
  rows = screen.getByRole('table', { name: 'Rules' }).getByRole('row');
  await screen.getByRole('button', { name: /^Move rule mcc equals 1001 down$/ }).click();

  await expect.element(rows.nth(1)).toHaveTextContent('counterparty');
  await expect.element(rows.nth(2)).toHaveTextContent('mcc');
  await expect.element(rows.nth(1).getByRole('cell').nth(5)).toHaveTextContent('3');
  await expect.element(rows.nth(2).getByRole('cell').nth(5)).toHaveTextContent('1');
  cleanup();

  screen = await render(TransactionsView);
  await expect
    .element(screen.getByRole('option', { name: /^Transfers out$/, selected: true }))
    .toHaveLength(3);
  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toHaveLength(1);
});

test("editing a rule's pattern keeps its position and re-evaluates its matches", async () => {
  await importRows([SHOP_ALPHA_1, SHOP_ALPHA_2, SHOP_ALPHA_3, SHOP_BETA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Transfers out');
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Transfers out' });
  await addRule(screen, { field: 'mcc', pattern: '1001', category: 'Groceries' });

  const rows = screen.getByRole('table', { name: 'Rules' }).getByRole('row');
  await expect.element(rows.nth(1)).toHaveTextContent('mcc');
  await expect.element(rows.nth(2)).toHaveTextContent('counterparty');

  await screen.getByRole('button', { name: /^Edit rule counterparty equals Shop Alpha$/ }).click();
  await expect.element(screen.getByLabelText('Pattern')).toHaveValue('Shop Alpha');
  await screen.getByLabelText('Pattern').fill('Shop Beta');
  await screen.getByRole('button', { name: 'Save rule' }).click();

  await expect.element(rows.nth(1)).toHaveTextContent('mcc');
  await expect.element(rows.nth(2)).toHaveTextContent('counterparty');
  await expect.element(rows.nth(2)).toHaveTextContent('Shop Beta');
  await expect.element(rows.nth(2).getByRole('cell').nth(5)).toHaveTextContent('0');

  await screen.getByRole('button', { name: /^Move rule counterparty equals Shop Beta up$/ }).click();

  await expect.element(rows.nth(1)).toHaveTextContent('counterparty');
  await expect.element(rows.nth(2)).toHaveTextContent('mcc');
  await expect.element(rows.nth(1).getByRole('cell').nth(5)).toHaveTextContent('1');
  await expect.element(rows.nth(2).getByRole('cell').nth(5)).toHaveTextContent('3');
  cleanup();

  screen = await render(TransactionsView);
  await expect
    .element(screen.getByRole('option', { name: /^Transfers out$/, selected: true }))
    .toHaveLength(1);
  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toHaveLength(3);
});

test('editing a rule changes its category while keeping its position', async () => {
  await importRows([SHOP_ALPHA_1, SHOP_BETA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(CategoriesView);
  await addCategory(screen, 'Snacks');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Groceries' });
  await addRule(screen, { field: 'mcc', pattern: '1001', category: 'Groceries' });

  const rows = screen.getByRole('table', { name: 'Rules' }).getByRole('row');
  await expect.element(rows.nth(1)).toHaveTextContent('mcc');
  await expect.element(rows.nth(2)).toHaveTextContent('counterparty');

  await screen.getByRole('button', { name: /^Edit rule counterparty equals Shop Alpha$/ }).click();
  const categorySelect = screen.getByLabelText('Category');
  await categorySelect.selectOptions(categorySelect.getByRole('option', { name: /^Snacks$/ }));
  await screen.getByRole('button', { name: 'Save rule' }).click();

  await expect.element(rows.nth(1)).toHaveTextContent('mcc');
  await expect.element(rows.nth(2)).toHaveTextContent('counterparty');
  await expect.element(rows.nth(2).getByRole('cell', { name: /^Snacks$/ })).toBeVisible();
});

test('deleting a rule removes it from the table and its rows become uncategorized', async () => {
  await importRows([SHOP_ALPHA_1], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(RulesView);
  await addRule(screen, { pattern: 'Shop Alpha', category: 'Groceries' });
  await expect.element(screen.getByRole('row', { name: /Shop Alpha/ })).toBeVisible();

  await screen.getByRole('button', { name: /^Delete rule counterparty equals Shop Alpha$/ }).click();
  await expect
    .element(screen.getByText('No rules yet. Pick a category on a transaction to create one.'))
    .toBeVisible();
  cleanup();

  screen = await render(TransactionsView);
  await expect.element(screen.getByText(/^rule$/)).not.toBeInTheDocument();
  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await expect.element(select).toHaveValue('uncategorized');
});

test('an empty pattern and an invalid regex are rejected without adding a rule', async () => {
  const screen = await render(RulesView);

  await screen.getByRole('button', { name: 'Save rule' }).click();
  await expect.element(screen.getByText('Pattern is required.')).toBeVisible();

  await screen.getByLabelText('Pattern').fill('   ');
  await screen.getByRole('button', { name: 'Save rule' }).click();
  await expect.element(screen.getByText('Pattern is required.')).toBeVisible();

  const matchSelect = screen.getByLabelText('Match');
  await matchSelect.selectOptions(matchSelect.getByRole('option', { name: 'regex' }));
  await screen.getByLabelText('Pattern').fill('(');
  await screen.getByRole('button', { name: 'Save rule' }).click();
  await expect
    .element(screen.getByText('Pattern is not a valid regular expression.'))
    .toBeVisible();

  await expect
    .element(screen.getByText('No rules yet. Pick a category on a transaction to create one.'))
    .toBeVisible();

  await matchSelect.selectOptions(matchSelect.getByRole('option', { name: 'equals' }));
  await screen.getByLabelText('Pattern').fill('Shop (Alpha');
  await screen.getByRole('button', { name: 'Save rule' }).click();
  await expect.element(screen.getByRole('row', { name: /Shop \(Alpha/ })).toBeVisible();
});
