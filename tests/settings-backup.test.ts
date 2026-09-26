import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsView from '../src/ui/views/SettingsView.svelte';
import { captureDownload } from './helpers/captureDownload';
import { freezeDate } from './helpers/freezeDate';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

type Screen = Awaited<ReturnType<typeof render>>;

const SLOW = { timeout: 5000 };

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

  await screen.getByRole('button', { name: 'Wipe all data' }).click();
  await screen
    .getByRole('dialog', { name: 'Wipe all data' })
    .getByRole('button', { name: /^Wipe$/ })
    .click();

  await expect.element(screen.getByText(/^Never backed up\.$/)).toBeVisible();
});
