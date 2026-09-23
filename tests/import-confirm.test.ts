import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImportView from '../src/ui/views/ImportView.svelte';
import { makeStatement, type StatementCell } from './helpers/makeStatement';

const COFFEE: StatementCell[] = ['14/03/2025', 'Payment - Amount: GEL10.00; Coffee', -10];
const BOOKS: StatementCell[] = ['15/03/2025', 'Payment - Amount: GEL20.00; Books', -20];
const RENT: StatementCell[] = ['16/03/2025', 'Payment - Amount: GEL30.00; Rent', -30];

async function upload(screen: Awaited<ReturnType<typeof render>>, rows: StatementCell[][]) {
  await screen.getByLabelText('Statement file').upload(await makeStatement(rows));
}

test('a confirmed import turns its rows into duplicates on the next upload', async () => {
  const screen = await render(ImportView);

  await upload(screen, [COFFEE, BOOKS]);
  await expect.element(screen.getByText('New rows: 2')).toBeVisible();

  await screen.getByRole('button', { name: 'Confirm import' }).click();
  await expect.element(screen.getByText('Imported 2 rows.')).toBeVisible();
  await expect.element(screen.getByText('New rows: 0')).toBeVisible();
  await expect.element(screen.getByText('Duplicate rows: 2')).toBeVisible();

  await upload(screen, [COFFEE, BOOKS]);
  await expect.element(screen.getByText('New rows: 0')).toBeVisible();
  await expect.element(screen.getByText('Duplicate rows: 2')).toBeVisible();
});

test('two identical rows in one file are both new', async () => {
  const screen = await render(ImportView);

  await upload(screen, [COFFEE, COFFEE]);

  await expect.element(screen.getByText('New rows: 2')).toBeVisible();
  await expect.element(screen.getByText('Duplicate rows: 0')).toBeVisible();
});

test('overlapping exports import as a union, without duplicates', async () => {
  const screen = await render(ImportView);

  await upload(screen, [COFFEE, BOOKS]);
  await screen.getByRole('button', { name: 'Confirm import' }).click();
  await expect.element(screen.getByText('Imported 2 rows.')).toBeVisible();

  await upload(screen, [BOOKS, RENT]);
  await expect.element(screen.getByText('New rows: 1')).toBeVisible();
  await expect.element(screen.getByText('Duplicate rows: 1')).toBeVisible();
});

test('rows alike in every field but the amount are not duplicates', async () => {
  const screen = await render(ImportView);

  await upload(screen, [['14/03/2025', 'Repeat payment', -10]]);
  await screen.getByRole('button', { name: 'Confirm import' }).click();
  await expect.element(screen.getByText('Imported 1 rows.')).toBeVisible();

  await upload(screen, [['14/03/2025', 'Repeat payment', -20]]);
  await expect.element(screen.getByText('New rows: 1')).toBeVisible();
  await expect.element(screen.getByText('Duplicate rows: 0')).toBeVisible();
});

test('a file with nothing new offers no confirm button', async () => {
  const screen = await render(ImportView);

  await upload(screen, [COFFEE]);
  await screen.getByRole('button', { name: 'Confirm import' }).click();
  await expect.element(screen.getByText('Imported 1 rows.')).toBeVisible();

  await upload(screen, [COFFEE]);
  await expect.element(screen.getByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
  await expect.element(screen.getByText('Nothing new to import.')).toBeVisible();
});
