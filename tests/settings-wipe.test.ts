import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import SettingsView from '../src/ui/views/SettingsView.svelte';
import { captureDownload } from './helpers/captureDownload';
import { categorize } from './helpers/categorize';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

type Screen = Awaited<ReturnType<typeof render>>;

const WIPE_TIMEOUT = { timeout: 15000 };

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

const STREAM_AFTER: StatementCell[] = [
  '12/02/2025',
  'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005',
  null,
  -20,
  null,
];

const STREAM_JAN: StatementCell[] = [
  '28/01/2025',
  'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005',
  null,
  -20,
  null,
];

const CAFE_EUR: StatementCell[] = [
  '15/03/2025',
  'Payment - Amount: EUR10.00; Merchant: Cafe Gamma, Online; MCC:5812',
  null,
  null,
  -10,
];

const ALL_FIVE = [CONVERSION_GEL, CONVERSION_USD, STREAM_AFTER, STREAM_JAN, CAFE_EUR];

const WIPE_MESSAGE =
  'Delete all transactions, imports, categories, rules and manual rates? This cannot be undone. Export a backup first if you may need them.';

function wipeDialog(screen: Screen) {
  return screen.getByRole('dialog', { name: 'Wipe all data' });
}

async function openWipeDialog(screen: Screen) {
  await screen.getByRole('button', { name: 'Wipe all data' }).click();
}

async function confirmWipe(screen: Screen) {
  await openWipeDialog(screen);
  await wipeDialog(screen).getByRole('button', { name: /^Wipe$/ }).click();
}

async function saveUsdRate(screen: Screen, value: string) {
  await screen.getByLabelText('Manual rate for USD').fill(value);
  await screen.getByRole('button', { name: 'Save rate for USD' }).click();
}

async function setUpData() {
  await importRows(ALL_FIVE, OPTIONS);
  await categorize([{ name: 'Streaming', contains: 'Stream' }]);
}

test('cancelling a wipe keeps everything', WIPE_TIMEOUT, async () => {
  await setUpData();
  const screen = await render(SettingsView);
  await saveUsdRate(screen, '2.5');

  await openWipeDialog(screen);
  await expect.element(wipeDialog(screen).getByText(WIPE_MESSAGE)).toBeVisible();

  await wipeDialog(screen).getByRole('button', { name: /^Cancel$/ }).click();
  await expect.element(wipeDialog(screen)).not.toBeInTheDocument();

  await expect
    .element(screen.getByRole('table', { name: 'Imports' }).getByRole('row'))
    .toHaveLength(2);
  await expect.element(screen.getByRole('table', { name: 'Manual rates' })).toBeVisible();

  const download = captureDownload();
  await screen.getByRole('button', { name: 'Export backup' }).click();
  const backup = JSON.parse(await (await download()).text());
  expect(backup.transactions).toHaveLength(5);
  expect(backup.importBatches).toHaveLength(1);

  const reloaded = await remount(SettingsView);
  await expect
    .element(reloaded.getByRole('table', { name: 'Imports' }).getByRole('row'))
    .toHaveLength(2);
});

test(
  'wipe leaves the app as freshly installed, and it stays so after a reload',
  WIPE_TIMEOUT,
  async () => {
    await setUpData();
    const setup = await render(SettingsView);
    await saveUsdRate(setup, '2.5');

    location.hash = '#/settings';
    let screen = await remount(App);
    await confirmWipe(screen);

    await expect.element(screen.getByText('No imports yet.')).toBeVisible();
    await expect.element(screen.getByText('No foreign-currency transactions.')).toBeVisible();

    await screen.getByRole('link', { name: 'Transactions' }).click();
    await expect
      .element(screen.getByText('No transactions yet. Import a statement to get started.'))
      .toBeVisible();

    await screen.getByRole('link', { name: 'Categories' }).click();
    await expect
      .element(screen.getByRole('table', { name: 'Categories' }).getByRole('row'))
      .toHaveLength(2);
    await expect.element(screen.getByRole('cell', { name: /^Currency conversion$/ })).toBeVisible();

    await screen.getByRole('link', { name: 'Rules' }).click();
    await expect
      .element(screen.getByText('No rules yet. Pick a category on a transaction to create one.'))
      .toBeVisible();

    screen = await remount(App);
    await screen.getByRole('link', { name: 'Settings' }).click();
    await expect.element(screen.getByText('No imports yet.')).toBeVisible();

    await screen.getByRole('link', { name: 'Categories' }).click();
    await expect
      .element(screen.getByRole('table', { name: 'Categories' }).getByRole('row'))
      .toHaveLength(2);
  },
);
