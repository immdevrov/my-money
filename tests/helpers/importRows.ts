import { expect } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import ImportView from '../../src/ui/views/ImportView.svelte';
import { makeStatement, type StatementCell, type StatementOptions } from './makeStatement';

export async function importRows(
  rows: StatementCell[][],
  options?: StatementOptions,
): Promise<void> {
  const screen = await render(ImportView);

  await screen.getByLabelText('Statement file').upload(await makeStatement(rows, options));
  await screen.getByRole('button', { name: 'Confirm import' }).click();
  await expect.element(screen.getByRole('status')).toBeVisible();

  cleanup();
}
