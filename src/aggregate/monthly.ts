import type { Category, Transaction } from '../domain/types';
import { countRow } from './count';
import { rateTableFrom } from './gel';
import { dashboardPeriods, periodOf } from './period';

export type MonthlyTotal = { month: string; spending: number; income: number };

export function monthlyTotals(input: {
  rows: Transaction[];
  categories: Category[];
  today: string;
}): { months: MonthlyTotal[]; missingRate: number } {
  const { rows, today } = input;
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  const table = rateTableFrom(rows);

  const span = dashboardPeriods(rows, today, 'month').span;
  const totals = new Map<string, MonthlyTotal>(
    [...span].reverse().map((month) => [month, { month, spending: 0, income: 0 }]),
  );
  let missingRate = 0;

  for (const row of rows) {
    const total = totals.get(periodOf(row.effectiveDate, 'month'));
    if (total === undefined) continue;

    const counted = countRow(row, categories, table);
    if (counted.status === 'no-rate') missingRate += 1;
    if (counted.status !== 'counted') continue;

    total[counted.tab] += counted.amount;
  }

  return { months: [...totals.values()], missingRate };
}
