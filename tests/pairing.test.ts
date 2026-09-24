import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImportView from '../src/ui/views/ImportView.svelte';
import TransactionsView from '../src/ui/views/TransactionsView.svelte';
import { importRows } from './helpers/importRows';
import { makeStatement, type StatementCell } from './helpers/makeStatement';

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

const EUR_NO_GEL: StatementCell[] = [
  '11/02/2025',
  'Income - Amount EUR50.00; Foreign Exchange. FX Rate:3.1',
  null,
  null,
  50,
];

const USD_NO_GEL: StatementCell[] = [
  '11/02/2025',
  'Payment - Amount USD30.00; Foreign Exchange. FX Rate:3.1',
  null,
  -30,
  null,
];

const STREAM_AFTER: StatementCell[] = [
  '12/02/2025',
  'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005',
  null,
  -20,
  null,
];

const STREAM_BEFORE: StatementCell[] = [
  '01/02/2025',
  'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005',
  null,
  -20,
  null,
];

const ROUNDS_UP: StatementCell[] = [
  '12/02/2025',
  'Payment - Amount: USD3.33; Merchant: Stream Iota, Online; MCC:1005',
  null,
  -3.33,
  null,
];

const LEGACY_GEL: StatementCell[] = [
  '20/02/2025',
  'Income - Amount: GEL200.00; Automatic conversion, rate: 2.0000',
  200,
  null,
  null,
];

const LEGACY_USD: StatementCell[] = [
  '20/02/2025',
  'Payment - Amount: USD100.00; Automatic conversion, rate: 2.0000',
  null,
  -100,
  null,
];

const USD_SAME_DAY_OTHER_RATE: StatementCell[] = [
  '10/02/2025',
  'Payment - Amount USD100.00; Foreign Exchange. FX Rate:3.1',
  null,
  -100,
  null,
];

const STREAM_LATE: StatementCell[] = [
  '25/02/2025',
  'Payment - Amount: USD20.00; Merchant: Stream Beta, Online; MCC:1005',
  null,
  -20,
  null,
];

async function uploadOnly(rows: StatementCell[][]) {
  const screen = await render(ImportView);
  await screen.getByLabelText('Statement file').upload(await makeStatement(rows, OPTIONS));
  await screen.getByRole('button', { name: 'Confirm import' }).click();
  return screen;
}

test('a conversion pair shows as paired on both sides', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^paired$/ })).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^unpaired$/ })).not.toBeInTheDocument();
});

test('a conversion written the older way pairs just the same', async () => {
  await importRows([LEGACY_GEL, LEGACY_USD], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^paired$/ })).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^-200\.00$/ })).toBeVisible();
});

test('a conversion with no counterpart is unpaired and warns on import', async () => {
  const screen = await uploadOnly([CONVERSION_GEL]);

  await expect.element(screen.getByText('1 conversion rows could not be paired.')).toBeVisible();
});

test('a foreign conversion with no GEL counterpart is also reported unpaired', async () => {
  const screen = await uploadOnly([CONVERSION_USD]);

  await expect.element(screen.getByText('1 conversion rows could not be paired.')).toBeVisible();
});

test('two foreign conversions do not pair with each other', async () => {
  const screen = await uploadOnly([EUR_NO_GEL, USD_NO_GEL]);

  await expect.element(screen.getByText('2 conversion rows could not be paired.')).toBeVisible();
});

test('conversions on the same day at different rates do not pair', async () => {
  await importRows([CONVERSION_GEL, USD_SAME_DAY_OTHER_RATE], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^unpaired$/ })).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^paired$/ })).not.toBeInTheDocument();
});

test('a pair split across two files pairs after the second import', async () => {
  await importRows([CONVERSION_GEL], OPTIONS);

  let screen = await render(TransactionsView);
  await expect.element(screen.getByRole('cell', { name: /^unpaired$/ })).toBeVisible();

  await importRows([CONVERSION_USD], OPTIONS);

  screen = await render(TransactionsView);
  await expect.element(screen.getByRole('cell', { name: /^unpaired$/ })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('cell', { name: /^paired$/ })).toHaveLength(2);
});

test('a non-GEL transaction shows its GEL amount at the nearest earlier rate', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, STREAM_AFTER], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^-54\.70$/ })).toBeVisible();
});

test('with several earlier rates, the most recent one applies', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, LEGACY_GEL, LEGACY_USD, STREAM_LATE], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^-40\.00$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^-54\.70$/ })).not.toBeInTheDocument();
});

test('a converted amount is rounded half-up, not truncated', async () => {
  await importRows([CONVERSION_GEL, CONVERSION_USD, ROUNDS_UP], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^-9\.11$/ })).toBeVisible();
});

test('a rate is not applied to a transaction dated before it', async () => {
  await importRows([STREAM_BEFORE, CONVERSION_GEL, CONVERSION_USD], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^no rate$/ })).toHaveLength(1);
});

test('a GEL transaction needs no rate', async () => {
  await importRows([['14/03/2025', 'Alpha payment', -30, null, null]], OPTIONS);
  const screen = await render(TransactionsView);

  await expect.element(screen.getByRole('cell', { name: /^-30\.00$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^no rate$/ })).not.toBeInTheDocument();
});
