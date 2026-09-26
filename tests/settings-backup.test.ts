import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import CategoriesView from '../src/ui/views/CategoriesView.svelte';
import SettingsView from '../src/ui/views/SettingsView.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { captureDownload } from './helpers/captureDownload';
import { categorize } from './helpers/categorize';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

type Screen = Awaited<ReturnType<typeof render>>;

const SLOW = { timeout: 5000 };
const ROUND_TRIP = { timeout: 15000 };

const OPTIONS = { header: ['Date', 'Details', 'GEL', 'USD', 'EUR'] };

const CONVERSION_GEL: StatementCell[] = [
  '10/02/2025',
  'Income - Amount GEL273.50; Foreign Exchange. FX Rate:2.735.',
  273.5,
  null,
  null,
];

const CONVERSION_USD: StatementCell[] = [
  '10/02/2025',
  'Payment - Amount USD100.00; Foreign Exchange. FX Rate:2.735',
  null,
  -100,
  null,
];

const STREAM_JAN: StatementCell[] = [
  '28/01/2025',
  'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005',
  null,
  -20,
  null,
];

const GROCER: StatementCell[] = ['05/02/2025', 'Grocer payment', -12, null, null];

const SHOP_ALPHA: StatementCell[] = ['06/02/2025', 'Shop Alpha', -7, null, null];

const ALPHA_PAYMENT: StatementCell[] = ['05/02/2025', 'Alpha payment', -1, null, null];

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function restoreDialog(screen: Screen) {
  return screen.getByRole('dialog', { name: 'Restore backup' });
}

async function chooseBackup(screen: Screen, file: File) {
  await screen.getByLabelText('Restore from backup').upload(file);
}

async function restore(screen: Screen, file: File) {
  await chooseBackup(screen, file);
  await restoreDialog(screen).getByRole('button', { name: /^Restore$/ }).click();
}

async function wipe(screen: Screen) {
  await screen.getByRole('button', { name: 'Wipe all data' }).click();
  await screen
    .getByRole('dialog', { name: 'Wipe all data' })
    .getByRole('button', { name: /^Wipe$/ })
    .click();
}

function tableRows(screen: Screen, name: string) {
  return screen.getByRole('table', { name }).getByRole('row');
}

function rowTexts(screen: Screen, name: string): string[] {
  return tableRows(screen, name)
    .elements()
    .map((row) => row.textContent ?? '');
}

function categoryChoices(screen: Screen): string[] {
  return screen
    .getByRole('table', { name: 'Transactions' })
    .getByRole('combobox')
    .elements()
    .map((select) => (select as HTMLSelectElement).value);
}

async function saveUsdRate(screen: Screen, value: string) {
  await screen.getByLabelText('Manual rate for USD').fill(value);
  await screen.getByRole('button', { name: 'Save rate for USD' }).click();
}

async function exportBackup(screen: Screen): Promise<File> {
  const download = captureDownload();
  await screen.getByRole('button', { name: 'Export backup' }).click();
  return await download();
}

test('export downloads a dated backup of every stored table', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows([CONVERSION_GEL, CONVERSION_USD, STREAM_JAN], OPTIONS);
  const setup = await render(SettingsView);
  await saveUsdRate(setup, '2.5');

  const screen = await remount(SettingsView);
  await expect.element(screen.getByLabelText('Manual rate for USD')).toHaveValue('2.5');
  const file = await exportBackup(screen);

  expect(file.name).toBe('budget-my-backup-2025-06-15.json');
  const backup = JSON.parse(await file.text());
  expect(backup.format).toBe('budget-my-backup');
  expect(backup.version).toBe(1);
  expect(backup.transactions).toHaveLength(3);
  expect(backup.importBatches).toHaveLength(1);
  expect(backup.categories).toHaveLength(1);
  expect(backup.categories[0].name).toBe('Currency conversion');
  expect(backup.rules).toHaveLength(0);
  expect(backup.manualRates).toEqual({ USD: 2500000 });
  for (const transaction of backup.transactions) {
    expect(transaction).not.toHaveProperty('kind');
    expect(transaction).not.toHaveProperty('effectiveDate');
  }
});

test('the last backup counts calendar days', async () => {
  freezeDate('2025-06-15T23:30:00');
  let screen = await render(SettingsView);
  await expect.element(screen.getByText(/^Never backed up\.$/)).toBeVisible();

  await exportBackup(screen);
  await expect.element(screen.getByText(/^Last backup: today\.$/)).toBeVisible();

  freezeDate('2025-06-16T00:30:00');
  screen = await remount(SettingsView);
  await expect.element(screen.getByText(/^Last backup: 1 day ago\.$/)).toBeVisible();

  freezeDate('2025-06-18T09:00:00');
  screen = await remount(SettingsView);
  await expect.element(screen.getByText(/^Last backup: 3 days ago\.$/)).toBeVisible();
});

test('a wipe forgets the last backup', async () => {
  const screen = await render(SettingsView);
  await exportBackup(screen);
  await expect.element(screen.getByText(/^Last backup: today\.$/)).toBeVisible();

  await wipe(screen);

  await expect.element(screen.getByText(/^Never backed up\.$/)).toBeVisible();
});

type Recorded = {
  transactions: string[];
  choices: string[];
  categories: string[];
  rules: string[];
  imports: string[];
  rate: string;
};

async function expectRecorded(screen: Screen, recorded: Recorded) {
  await screen.getByRole('link', { name: 'Transactions' }).click();
  await expect.poll(() => rowTexts(screen, 'Transactions')).toEqual(recorded.transactions);
  await expect.poll(() => categoryChoices(screen)).toEqual(recorded.choices);

  await screen.getByRole('link', { name: 'Categories' }).click();
  await expect.poll(() => rowTexts(screen, 'Categories')).toEqual(recorded.categories);

  await screen.getByRole('link', { name: 'Rules' }).click();
  await expect.poll(() => rowTexts(screen, 'Rules')).toEqual(recorded.rules);

  await screen.getByRole('link', { name: 'Settings' }).click();
  await expect.element(screen.getByLabelText('Manual rate for USD')).toHaveValue(recorded.rate);
  await expect.poll(() => rowTexts(screen, 'Imports')).toEqual(recorded.imports);
}

test('a backup restores everything identically, and it survives a reload', ROUND_TRIP, async () => {
  freezeDate('2025-06-15T12:00:00');
  await importRows([CONVERSION_GEL, CONVERSION_USD, STREAM_JAN, GROCER, SHOP_ALPHA], OPTIONS);
  await categorize([{ name: 'Groceries', contains: 'Grocer' }]);

  location.hash = '#/settings';
  let screen = await render(App);
  await saveUsdRate(screen, '2.5');
  const rateInput = screen.getByLabelText('Manual rate for USD');
  await expect.element(rateInput).toHaveValue('2.5');
  const rate = (rateInput.element() as HTMLInputElement).value;
  await expect.element(tableRows(screen, 'Imports')).toHaveLength(2);
  const imports = rowTexts(screen, 'Imports');

  await screen.getByRole('link', { name: 'Transactions' }).click();
  const alphaSelect = screen.getByRole('combobox', { name: 'Category for Shop Alpha' });
  await alphaSelect.selectOptions(alphaSelect.getByRole('option', { name: /^Groceries$/ }));
  await screen.getByRole('button', { name: /^No$/ }).click();
  await expect.element(screen.getByRole('button', { name: /^No$/ })).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^manual$/)).toBeVisible();
  await expect.element(screen.getByText(/^rule$/)).toBeVisible();
  await expect.element(tableRows(screen, 'Transactions')).toHaveLength(6);
  const transactions = rowTexts(screen, 'Transactions');
  const choices = categoryChoices(screen);

  await screen.getByRole('link', { name: 'Categories' }).click();
  await expect.element(tableRows(screen, 'Categories')).toHaveLength(3);
  const categories = rowTexts(screen, 'Categories');

  await screen.getByRole('link', { name: 'Rules' }).click();
  const ruleCells = tableRows(screen, 'Rules').nth(1).getByRole('cell');
  await expect.element(ruleCells.nth(4)).toHaveTextContent(/^Groceries$/);
  await expect.element(ruleCells.nth(5)).toHaveTextContent(/^1$/);
  await expect.element(tableRows(screen, 'Rules')).toHaveLength(2);
  const rules = rowTexts(screen, 'Rules');

  const recorded: Recorded = { transactions, choices, categories, rules, imports, rate };

  await screen.getByRole('link', { name: 'Settings' }).click();
  const file = await exportBackup(screen);
  await wipe(screen);
  await expect.element(screen.getByText('No imports yet.')).toBeVisible();

  await chooseBackup(screen, file);
  await expect
    .element(
      restoreDialog(screen).getByText(
        'Replace all data with this backup? It holds 5 transactions, 2 categories and 1 rules. Your current 0 transactions will be replaced.',
      ),
    )
    .toBeVisible();
  await restoreDialog(screen).getByRole('button', { name: /^Restore$/ }).click();
  await expect.element(screen.getByRole('status')).toHaveTextContent(/^Backup restored\.$/);
  await expect.element(restoreDialog(screen)).not.toBeInTheDocument();

  await expectRecorded(screen, recorded);

  screen = await remount(App);
  await expectRecorded(screen, recorded);
});

test('a restore reports the age of the backup it restored', SLOW, async () => {
  freezeDate('2025-06-15T12:00:00');
  const screen = await render(SettingsView);
  const file = await exportBackup(screen);
  await wipe(screen);
  await expect.element(screen.getByText(/^Never backed up\.$/)).toBeVisible();

  freezeDate('2025-06-20T12:00:00');
  await restore(screen, file);

  await expect.element(screen.getByText(/^Last backup: 5 days ago\.$/)).toBeVisible();
});

test('cancelling a restore changes nothing', SLOW, async () => {
  await importRows([STREAM_JAN], OPTIONS);
  let screen = await render(SettingsView);
  const file = await exportBackup(screen);
  await importRows([ALPHA_PAYMENT], OPTIONS);

  screen = await render(SettingsView);
  await chooseBackup(screen, file);
  await expect
    .element(
      restoreDialog(screen).getByText(
        'Replace all data with this backup? It holds 1 transactions, 1 categories and 0 rules. Your current 2 transactions will be replaced.',
      ),
    )
    .toBeVisible();
  await restoreDialog(screen).getByRole('button', { name: /^Cancel$/ }).click();
  await expect.element(restoreDialog(screen)).not.toBeInTheDocument();

  screen = await remount(TransactionsView);
  await expect.element(tableRows(screen, 'Transactions')).toHaveLength(3);
});

const REFUSED: [string, string][] = [
  ['nope', 'This file is not valid JSON.'],
  ['{"hello":1}', 'This file is not a budget-my backup.'],
  ['{"format":"budget-my-backup","version":2}', 'This backup is version 2; this app reads version 1.'],
  [
    '{"format":"budget-my-backup","version":1,"transactions":[],"importBatches":[],"categories":[],"rules":[],"manualRates":{}}',
    'This backup is damaged: exportedAt is invalid.',
  ],
  [
    '{"format":"budget-my-backup","version":1,"exportedAt":"yesterday","transactions":[],"importBatches":[],"categories":[],"rules":[],"manualRates":{}}',
    'This backup is damaged: exportedAt is invalid.',
  ],
  [
    '{"format":"budget-my-backup","version":1,"exportedAt":"2025-06-15T08:00:00.000Z","transactions":[],"importBatches":[],"categories":[],"manualRates":{}}',
    'This backup is damaged: rules is missing.',
  ],
  [
    '{"format":"budget-my-backup","version":1,"exportedAt":"2025-06-15T08:00:00.000Z","transactions":[{"id":1}],"importBatches":[],"categories":[],"rules":[],"manualRates":{}}',
    'This backup is damaged: transactions entry 1 is invalid.',
  ],
];

test('a file that is not a usable backup is refused and changes nothing', SLOW, async () => {
  await importRows([STREAM_JAN], OPTIONS);
  let screen = await render(SettingsView);

  for (const [text, sentence] of REFUSED) {
    await chooseBackup(screen, new File([text], 'bad.json', { type: 'application/json' }));
    await expect.element(screen.getByRole('alert')).toHaveTextContent(exactly(sentence));
    await expect.element(restoreDialog(screen)).not.toBeInTheDocument();
  }

  screen = await remount(TransactionsView);
  await expect.element(tableRows(screen, 'Transactions')).toHaveLength(2);
});

test('a restore that fails leaves the data intact', SLOW, async () => {
  await importRows([STREAM_JAN], OPTIONS);
  let screen = await render(SettingsView);
  const exported = await exportBackup(screen);
  const backup = JSON.parse(await exported.text());
  backup.transactions.push({ ...backup.transactions[0] });
  await importRows([ALPHA_PAYMENT], OPTIONS);

  screen = await render(SettingsView);
  await restore(
    screen,
    new File([JSON.stringify(backup)], 'dup.json', { type: 'application/json' }),
  );
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent(/^The backup could not be restored: /);

  screen = await remount(TransactionsView);
  await expect.element(tableRows(screen, 'Transactions')).toHaveLength(3);
  await expect.element(screen.getByRole('cell', { name: /^Alpha payment$/ })).toBeVisible();
});

test('a backup without Currency conversion gets it back on restore', SLOW, async () => {
  const backup = {
    format: 'budget-my-backup',
    version: 1,
    exportedAt: '2025-06-15T08:00:00.000Z',
    transactions: [
      {
        id: 'backup-row-1',
        postingDate: '2025-02-05',
        currency: 'GEL',
        amountMinor: -100,
        details: 'Alpha payment',
        importBatchId: 'backup-batch-1',
        manualCategoryId: null,
      },
    ],
    importBatches: [],
    categories: [],
    rules: [],
    manualRates: {},
  };
  let screen = await render(SettingsView);
  await restore(
    screen,
    new File([JSON.stringify(backup)], 'no-conversion.json', { type: 'application/json' }),
  );
  await expect.element(screen.getByRole('status')).toHaveTextContent(/^Backup restored\.$/);

  screen = await remount(CategoriesView);
  await expect.element(tableRows(screen, 'Categories')).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Currency conversion$/ })).toBeVisible();
});
