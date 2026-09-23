import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';

const VIEWS = ['Import', 'Transactions', 'Rules', 'Categories', 'Dashboard', 'Settings'];

test('every view is reachable from the navigation', async () => {
  const screen = await render(App);

  for (const name of VIEWS) {
    await expect.element(screen.getByRole('link', { name })).toBeVisible();
  }
});

test('the import view is shown by default', async () => {
  const screen = await render(App);

  await expect.element(screen.getByRole('heading', { name: 'Import' })).toBeVisible();
});

test('navigating marks the active link and swaps the view', async () => {
  const screen = await render(App);

  await screen.getByRole('link', { name: 'Transactions' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect
    .element(screen.getByText('No transactions yet. Import a statement to get started.'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Transactions' }))
    .toHaveAttribute('aria-current', 'page');
});
