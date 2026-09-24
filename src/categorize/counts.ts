import type { Transaction } from '../domain/types';

export function winsByRule(rows: Pick<Transaction, 'ruleId'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.ruleId === null) continue;
    counts.set(row.ruleId, (counts.get(row.ruleId) ?? 0) + 1);
  }
  return counts;
}
