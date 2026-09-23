import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImportView from '../src/ui/views/ImportView.svelte';
import { makeStatement } from './helpers/makeStatement';

test('a statement built in memory is previewed row by row', async () => {
  const screen = await render(ImportView);

  await screen.getByLabelText('Statement file').upload(
    await makeStatement([
      ['14/03/2025', 'Payment - Amount: GEL10.00; Coffee', -10],
      ['15/03/2025', 'Payment - Amount: GEL20.00; Books', -20],
    ]),
  );

  const rows = screen.getByRole('table', { name: 'Parsed rows' });

  await expect.element(rows.getByRole('row', { name: /^2 2025-03-14 .* -10\.00 GEL/ })).toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^3 2025-03-15 .* -20\.00 GEL/ })).toBeVisible();
  await expect.element(rows.getByRole('row', { name: /^4 / })).not.toBeInTheDocument();
});
