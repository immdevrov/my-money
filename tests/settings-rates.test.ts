import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsView from '../src/ui/views/SettingsView.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import type { StatementCell } from './helpers/makeStatement';
import { remount } from './helpers/remount';

type Screen = Awaited<ReturnType<typeof render>>;

const SLOW = { timeout: 5000 };

const OPTIONS = { header: ['Date', 'Details', 'GEL', 'USD', 'EUR'] };

const INVALID_MESSAGE = 'Enter a positive rate with up to 6 decimals, or leave it empty to clear it.';

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

async function saveUsdRate(screen: Screen, value: string) {
  await screen.getByLabelText('Manual rate for USD').fill(value);
  await screen.getByRole('button', { name: 'Save rate for USD' }).click();
}

test('a manual rate prices only what no conversion prices, and is marked', SLOW, async () => {
  await importRows(ALL_FIVE, OPTIONS);
  const settings = await render(SettingsView);
  await saveUsdRate(settings, '2.5');

  const screen = await remount(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^-50\.00 \(manual rate\)$/ })).toHaveLength(1);
  await expect.element(screen.getByRole('cell', { name: /^-54\.70$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^-273\.50$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^no rate$/ })).toHaveLength(1);
});

test('clearing a manual rate brings the marker back', SLOW, async () => {
  await importRows(ALL_FIVE, OPTIONS);
  let settings = await render(SettingsView);
  await saveUsdRate(settings, '2.5');

  settings = await remount(SettingsView);
  await expect.element(settings.getByLabelText('Manual rate for USD')).toHaveValue('2.5');
  await saveUsdRate(settings, '');

  const screen = await remount(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^no rate$/ })).toHaveLength(2);
  await expect.element(screen.getByText('(manual rate)')).not.toBeInTheDocument();
});

test('an invalid rate is refused and saves nothing', SLOW, async () => {
  await importRows(ALL_FIVE, OPTIONS);

  for (const value of ['abc', '0', '2.1234567']) {
    const settings = await remount(SettingsView);
    await expect.element(settings.getByText(INVALID_MESSAGE)).not.toBeInTheDocument();
    await saveUsdRate(settings, value);
    await expect.element(settings.getByText(INVALID_MESSAGE)).toBeVisible();
  }

  const settings = await remount(SettingsView);
  await expect.element(settings.getByLabelText('Manual rate for USD')).toHaveValue('');

  const screen = await remount(TransactionsView);
  await expect.element(screen.getByRole('cell', { name: /^no rate$/ })).toHaveLength(2);
});

test('the rates table lists each foreign currency with its rows without a conversion rate', SLOW, async () => {
  await importRows(ALL_FIVE, OPTIONS);
  const screen = await render(SettingsView);

  const rows = screen.getByRole('table', { name: 'Manual rates' }).getByRole('row');
  const expected = [
    ['EUR', '1'],
    ['USD', '1'],
  ];
  for (const [index, [currency = '', count = '']] of expected.entries()) {
    const row = rows.nth(index + 1);
    await expect.element(row.getByRole('rowheader')).toHaveTextContent(new RegExp(`^${currency}$`));
    await expect.element(row.getByRole('cell').first()).toHaveTextContent(new RegExp(`^${count}$`));
  }
  await expect.element(rows.nth(expected.length + 1)).not.toBeInTheDocument();
});

test('with only GEL rows there are no rates to set', SLOW, async () => {
  await importRows([['05/02/2025', 'Alpha payment', -1, null, null]], OPTIONS);
  const screen = await render(SettingsView);

  await expect.element(screen.getByText('No foreign-currency transactions.')).toBeVisible();
  await expect.element(screen.getByRole('table', { name: 'Manual rates' })).not.toBeInTheDocument();
});
