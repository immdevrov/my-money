import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsView from '../src/ui/views/SettingsView.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

type Screen = Awaited<ReturnType<typeof render>>;

const SLOW = { timeout: 5000 };

const HEADER = ['Date', 'Details', 'GEL', 'USD', 'EUR'];

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

const CAFE_EUR: StatementCell[] = [
  '15/03/2025',
  'Payment - Amount: EUR10.00; Merchant: Cafe Gamma, Online; MCC:5812',
  null,
  null,
  -10,
];

async function importJanuaryAndFebruary() {
  freezeDate('2025-03-01T10:00:00');
  await importRows([CONVERSION_GEL, ['05/02/2025', 'Alpha payment', -1, null, null]], {
    header: HEADER,
    fileName: 'january.xlsx',
  });
  freezeDate('2025-03-02T11:30:00');
  await importRows(
    [
      CONVERSION_USD,
      ['06/02/2025', 'Beta payment', -2, null, null],
      ['07/02/2025', 'Gamma payment', -3, null, null],
    ],
    { header: HEADER, fileName: 'february.xlsx' },
  );
}

function importRowsOf(screen: Screen) {
  return screen.getByRole('table', { name: 'Imports' }).getByRole('row');
}

function deleteDialog(screen: Screen) {
  return screen.getByRole('dialog', { name: 'Delete import' });
}

async function expectImportRow(screen: Screen, index: number, expected: string[]) {
  const cells = importRowsOf(screen).nth(index + 1).getByRole('cell');
  for (const [column, text] of expected.entries()) {
    await expect.element(cells.nth(column)).toHaveTextContent(new RegExp(`^${text.replaceAll('.', '\\.')}$`));
  }
}

async function deleteImport(screen: Screen, fileName: string) {
  await screen.getByRole('button', { name: `Delete import ${fileName}` }).click();
  await deleteDialog(screen).getByRole('button', { name: /^Delete$/ }).click();
}

test('with no imports the list says so', async () => {
  const screen = await render(SettingsView);

  await expect.element(screen.getByText('No imports yet.')).toBeVisible();
  await expect.element(screen.getByRole('table', { name: 'Imports' })).not.toBeInTheDocument();
});

test('imports are listed newest first with their live row counts', SLOW, async () => {
  await importJanuaryAndFebruary();
  const screen = await render(SettingsView);

  await expectImportRow(screen, 0, ['february.xlsx', '2025-03-02 11:30', '3']);
  await expectImportRow(screen, 1, ['january.xlsx', '2025-03-01 10:00', '2']);
  await expect.element(importRowsOf(screen).nth(3)).not.toBeInTheDocument();
});

test('deleting an import removes only its rows and unpairs what it paired', SLOW, async () => {
  await importJanuaryAndFebruary();

  const before = await render(TransactionsView);
  await expect.element(before.getByRole('cell', { name: /^paired$/ })).toHaveLength(2);

  const settings = await remount(SettingsView);
  await settings.getByRole('button', { name: 'Delete import january.xlsx' }).click();
  await expect
    .element(deleteDialog(settings).getByText('Delete import january.xlsx? This removes 2 transactions.'))
    .toBeVisible();

  await deleteDialog(settings).getByRole('button', { name: /^Cancel$/ }).click();
  await expect.element(deleteDialog(settings)).not.toBeInTheDocument();
  await expect.element(importRowsOf(settings)).toHaveLength(3);

  await deleteImport(settings, 'january.xlsx');
  await expect.element(deleteDialog(settings)).not.toBeInTheDocument();
  await expect.element(importRowsOf(settings)).toHaveLength(2);
  await expectImportRow(settings, 0, ['february.xlsx']);

  const after = await remount(TransactionsView);
  await expect.element(after.getByRole('table', { name: 'Transactions' }).getByRole('row')).toHaveLength(4);
  await expect.element(after.getByRole('cell', { name: /^Beta payment$/ })).toBeVisible();
  await expect.element(after.getByRole('cell', { name: /^Gamma payment$/ })).toBeVisible();
  await expect.element(after.getByRole('cell', { name: /^Alpha payment$/ })).not.toBeInTheDocument();
  await expect.element(after.getByRole('cell', { name: /^unpaired$/ })).toHaveLength(1);
  await expect.element(after.getByRole('cell', { name: /^paired$/ })).not.toBeInTheDocument();
});

test('a saved rate stays listed after its currency\'s rows are gone', SLOW, async () => {
  await importRows([CAFE_EUR], { header: HEADER, fileName: 'euro.xlsx' });
  const screen = await render(SettingsView);

  await screen.getByLabelText('Manual rate for EUR').fill('3');
  await screen.getByRole('button', { name: 'Save rate for EUR' }).click();
  await deleteImport(screen, 'euro.xlsx');

  await expect.element(screen.getByText('No imports yet.')).toBeVisible();
  const row = screen.getByRole('table', { name: 'Manual rates' }).getByRole('row').nth(1);
  await expect.element(row.getByRole('rowheader')).toHaveTextContent(/^EUR$/);
  await expect.element(row.getByRole('cell').first()).toHaveTextContent(/^0$/);
  await expect.element(screen.getByLabelText('Manual rate for EUR')).toHaveValue('3');
});
