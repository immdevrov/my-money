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

const SHOP_GAMMA: StatementCell[] = [
  '18/03/2025',
  'Payment - Amount: GEL14.00; Merchant: Shop Gamma, Tbilisi; MCC:1002; Date: 18/03/2025 10:00; Card No: ****3333',
  -14,
  null,
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

test('"Create rule" applies the category to every matching row and clears the originating manual assignment', async () => {
  await importRows([SHOP_ALPHA, SHOP_ALPHA_2, SHOP_ALPHA_3, SHOP_BETA_MCC1001, SHOP_GAMMA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(TransactionsView);
  const alphaRow1 = screen.getByRole('row', { name: /-10\.00 GEL/ });
  const select = alphaRow1.getByRole('combobox');
  await select.selectOptions(select.getByRole('option', { name: /^Groceries$/ }));

  await expect
    .element(
      screen.getByText(
        'Apply Groceries to all Shop Alpha transactions? It would categorize 3 now, and future imports too.',
      ),
    )
    .toBeVisible();

  await screen.getByRole('button', { name: 'Create rule' }).click();

  await expect.element(screen.getByText(/^rule$/)).toHaveLength(3);
  await expect.element(screen.getByText(/^manual$/)).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('combobox', { name: 'Category for Shop Beta' }))
    .toHaveValue('uncategorized');
  await expect
    .element(screen.getByRole('combobox', { name: 'Category for Shop Gamma' }))
    .toHaveValue('uncategorized');
  cleanup();

  screen = await render(RulesView);
  const ruleRow = screen.getByRole('row', { name: /Shop Alpha/ });
  await expect.element(ruleRow).toHaveTextContent('counterparty');
  await expect.element(ruleRow.getByRole('cell', { name: /^3$/ })).toBeVisible();
});

test('"No" leaves only the picked row categorized and the rest of Shop Alpha uncategorized', async () => {
  await importRows([SHOP_ALPHA, SHOP_ALPHA_2, SHOP_ALPHA_3], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(TransactionsView);
  const alphaRow1 = screen.getByRole('row', { name: /-10\.00 GEL/ });
  const select = alphaRow1.getByRole('combobox');
  await select.selectOptions(select.getByRole('option', { name: /^Groceries$/ }));

  await screen.getByRole('button', { name: 'No' }).click();

  await expect.element(screen.getByText(/^manual$/)).toHaveLength(1);
  await expect.element(alphaRow1.getByText(/^manual$/)).toBeVisible();
  await expect.element(screen.getByText(/^rule$/)).not.toBeInTheDocument();

  const alphaRow2 = screen.getByRole('row', { name: /-11\.00 GEL/ });
  await expect.element(alphaRow2.getByRole('combobox')).toHaveValue('uncategorized');
  const alphaRow3 = screen.getByRole('row', { name: /-12\.00 GEL/ });
  await expect.element(alphaRow3.getByRole('combobox')).toHaveValue('uncategorized');

  await expect
    .element(
      screen.getByText(
        'Apply Groceries to all Shop Alpha transactions? It would categorize 3 now, and future imports too.',
      ),
    )
    .not.toBeInTheDocument();
});

test('"Edit rule…" based on MCC categorizes every row with that MCC', async () => {
  await importRows([SHOP_ALPHA, SHOP_ALPHA_2, SHOP_ALPHA_3, SHOP_BETA_MCC1001, SHOP_GAMMA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(TransactionsView);
  const alphaRow1 = screen.getByRole('row', { name: /-10\.00 GEL/ });
  const select = alphaRow1.getByRole('combobox');
  await select.selectOptions(select.getByRole('option', { name: /^Groceries$/ }));

  await screen.getByRole('button', { name: 'Edit rule…' }).click();
  await expect.element(screen.getByText('Would categorize 3 transactions')).toBeVisible();

  await screen.getByRole('radio', { name: 'MCC = 1001' }).click();
  await expect.element(screen.getByText('Would categorize 4 transactions')).toBeVisible();

  await screen.getByRole('button', { name: 'Save rule' }).click();

  await expect.element(screen.getByText(/^rule$/)).toHaveLength(4);
  await expect.element(screen.getByText(/^manual$/)).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('combobox', { name: 'Category for Shop Gamma' }))
    .toHaveValue('uncategorized');
});

test('"Cancel" in the edit-rule dialog leaves the manual assignment and closes the prompt', async () => {
  await importRows([SHOP_ALPHA], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(TransactionsView);
  const select = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await select.selectOptions(select.getByRole('option', { name: /^Groceries$/ }));

  await screen.getByRole('button', { name: 'Edit rule…' }).click();
  await screen.getByRole('button', { name: 'Cancel' }).click();

  await expect
    .element(screen.getByRole('option', { name: /^Groceries$/, selected: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).toBeVisible();
  await expect
    .element(
      screen.getByText(
        'Apply Groceries to all Shop Alpha transactions? It would categorize 1 now, and future imports too.',
      ),
    )
    .not.toBeInTheDocument();
});

test('"New category…" shows the "apply to all" prompt for the created category', async () => {
  await importRows([SHOP_GAMMA], OPTIONS);
  const screen = await render(TransactionsView);

  const select = screen.getByRole('combobox', { name: 'Category for Shop Gamma' });
  await select.selectOptions(select.getByRole('option', { name: 'New category…' }));
  await screen.getByLabelText('Name').fill('Fun');
  await screen.getByRole('button', { name: 'Save category' }).click();

  await expect
    .element(
      screen.getByText(
        'Apply Fun to all Shop Gamma transactions? It would categorize 1 now, and future imports too.',
      ),
    )
    .toBeVisible();
});

test('picking another row replaces the prompt, and a paired conversion never shows one', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, SHOP_ALPHA, SHOP_BETA_MCC1001], OPTIONS);

  let screen = await render(CategoriesView);
  await addCategory(screen, 'Groceries');
  cleanup();

  screen = await render(TransactionsView);

  const alphaSelect = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await alphaSelect.selectOptions(alphaSelect.getByRole('option', { name: /^Groceries$/ }));
  await expect
    .element(
      screen.getByText(
        'Apply Groceries to all Shop Alpha transactions? It would categorize 1 now, and future imports too.',
      ),
    )
    .toBeVisible();

  const betaSelect = screen.getByRole('combobox', { name: 'Category for Shop Beta' });
  await betaSelect.selectOptions(betaSelect.getByRole('option', { name: /^Groceries$/ }));

  await expect
    .element(
      screen.getByText(
        'Apply Groceries to all Shop Alpha transactions? It would categorize 1 now, and future imports too.',
      ),
    )
    .not.toBeInTheDocument();
  await expect
    .element(
      screen.getByText(
        'Apply Groceries to all Shop Beta transactions? It would categorize 1 now, and future imports too.',
      ),
    )
    .toBeVisible();

  const gelRow = screen.getByRole('row', { name: /273\.50 GEL/ });
  const usdRow = screen.getByRole('row', { name: /-100\.00 USD/ });
  await expect.element(gelRow.getByRole('combobox')).not.toBeInTheDocument();
  await expect.element(usdRow.getByRole('combobox')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'No' })).toHaveLength(1);
});
