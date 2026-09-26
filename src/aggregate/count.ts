import type { Category, Transaction } from '../domain/types';
import type { Rate } from '../pairing/rates';
import { gelAmount } from './gel';

export type Tab = 'spending' | 'income';

export type Counted =
  | { status: 'counted'; tab: Tab; categoryId: string | null; amount: number }
  | { status: 'no-rate' }
  | { status: 'excluded' };

function tabOf(row: Transaction, category: Category | undefined): Tab | null {
  if (category === undefined) {
    if (row.amountMinor < 0) return 'spending';
    if (row.amountMinor > 0) return 'income';
    return null;
  }
  if (category.type === 'expense') return 'spending';
  if (category.type === 'income') return 'income';
  return null;
}

export function countRow(
  row: Transaction,
  categories: Map<string, Category>,
  table: Rate[],
): Counted {
  const category = row.categoryId === null ? undefined : categories.get(row.categoryId);
  const tab = tabOf(row, category);
  if (tab === null) return { status: 'excluded' };

  const gel = gelAmount(row, table);
  if (gel === null) return { status: 'no-rate' };

  return {
    status: 'counted',
    tab,
    categoryId: category === undefined ? null : category.id,
    amount: tab === 'spending' ? -gel : gel,
  };
}
