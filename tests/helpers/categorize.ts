import { expect } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import type { CategoryType } from '../../src/domain/types';
import CategoriesView from '../../src/ui/views/CategoriesView.svelte';
import RulesView from '../../src/ui/views/RulesView.svelte';

export type CategorySpec = { name: string; type?: CategoryType; contains?: string };

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export async function categorize(specs: CategorySpec[]): Promise<void> {
  const categories = await render(CategoriesView);
  const categoryTable = categories.getByRole('table', { name: 'Categories' });

  for (const spec of specs) {
    await categories.getByRole('button', { name: 'Add category' }).click();
    await categories.getByLabelText('Name').fill(spec.name);
    if (spec.type !== undefined && spec.type !== 'expense') {
      const typeSelect = categories.getByLabelText('Type');
      await typeSelect.selectOptions(typeSelect.getByRole('option', { name: spec.type }));
    }
    await categories.getByRole('button', { name: 'Save category' }).click();
    await expect
      .element(categoryTable.getByRole('cell', { name: exactly(spec.name) }))
      .toBeVisible();
  }

  cleanup();

  const withRules = specs.filter((spec) => spec.contains !== undefined);
  if (withRules.length === 0) return;

  const rules = await render(RulesView);

  for (const spec of withRules) {
    const pattern = spec.contains ?? '';
    await rules.getByRole('button', { name: 'Add rule' }).click();
    const matchSelect = rules.getByLabelText('Match');
    await matchSelect.selectOptions(matchSelect.getByRole('option', { name: 'contains' }));
    await rules.getByLabelText('Pattern').fill(pattern);
    const categorySelect = rules.getByLabelText('Category');
    await categorySelect.selectOptions(
      categorySelect.getByRole('option', { name: exactly(spec.name) }),
    );
    await rules.getByRole('button', { name: 'Save rule' }).click();
    const ruleTable = rules.getByRole('table', { name: 'Rules' });
    await expect.element(ruleTable.getByRole('cell', { name: exactly(pattern) })).toBeVisible();
  }

  cleanup();
}
