import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import App from '../src/App.svelte';
import CategoriesView from '../src/ui/views/CategoriesView.svelte';
import { remount } from './helpers/remount';

function tableRows(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole('table', { name: 'Categories' }).getByRole('row');
}

async function addCategory(
  screen: Awaited<ReturnType<typeof render>>,
  name: string,
  colourName?: string,
) {
  await screen.getByLabelText('Name').fill(name);
  if (colourName) {
    await screen
      .getByLabelText('Colour')
      .selectOptions(screen.getByRole('option', { name: colourName }));
  }
  await screen.getByRole('button', { name: 'Save category' }).click();
}

test('adding a category lists it with its type and colour', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries', 'Teal');

  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^expense$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /Teal/ })).toBeVisible();
});

test('a fresh database seeds exactly one category, Currency conversion', async () => {
  const screen = await render(CategoriesView);

  await expect.element(tableRows(screen)).toHaveLength(2);
  await expect.element(screen.getByRole('cell', { name: /^Currency conversion$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^transfer$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /Grey/ })).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Delete Currency conversion' }))
    .not.toBeInTheDocument();
});

test('an empty name and a duplicate name are rejected with their messages', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries');
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();

  await screen.getByLabelText('Name').fill('');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect.element(screen.getByText('Name is required.')).toBeVisible();

  await screen.getByLabelText('Name').fill('groceries ');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect
    .element(screen.getByText('A category with this name already exists.'))
    .toBeVisible();
});

test('renaming a category in the view updates its row', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries');
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();

  await screen.getByRole('button', { name: 'Edit Groceries' }).click();
  await screen.getByLabelText('Name').fill('Produce');
  await screen.getByRole('button', { name: 'Save category' }).click();

  await expect.element(screen.getByRole('cell', { name: /^Produce$/ })).toBeVisible();
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).not.toBeInTheDocument();
});

test('seeding runs once: a renamed Currency conversion keeps its name after a remount', async () => {
  let screen = await render(App);
  await screen.getByRole('link', { name: 'Categories' }).click();

  await screen.getByRole('button', { name: 'Edit Currency conversion' }).click();
  await screen.getByLabelText('Name').fill('FX');
  await screen.getByRole('button', { name: 'Save category' }).click();
  await expect.element(screen.getByRole('cell', { name: /^FX$/ })).toBeVisible();

  screen = await remount(App);
  await screen.getByRole('link', { name: 'Categories' }).click();

  await expect.element(screen.getByRole('cell', { name: /^FX$/ })).toBeVisible();
  await expect
    .element(screen.getByRole('cell', { name: /^Currency conversion$/ }))
    .not.toBeInTheDocument();
});

test('deleting a category with no rules or manual assignments confirms with zero counts and removes the row', async () => {
  const screen = await render(CategoriesView);

  await addCategory(screen, 'Groceries');
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).toBeVisible();

  await screen.getByRole('button', { name: 'Delete Groceries' }).click();
  await expect
    .element(screen.getByText('Delete Groceries? 0 rules and 0 manual assignments will be removed.'))
    .toBeVisible();

  await screen.getByRole('button', { name: /^Delete$/ }).click();
  await expect.element(screen.getByRole('cell', { name: /^Groceries$/ })).not.toBeInTheDocument();
});
