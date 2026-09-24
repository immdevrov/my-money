import type { Rule, Transaction } from '../domain/types';
import { assignCategory } from './assign';
import { insertRule } from './order';

export function winsByRule(rows: Pick<Transaction, 'ruleId'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.ruleId === null) continue;
    counts.set(row.ruleId, (counts.get(row.ruleId) ?? 0) + 1);
  }
  return counts;
}

const CANDIDATE_RULE_ID = '__candidate__';

export function wouldCategorize(
  rows: Transaction[],
  rules: Rule[],
  candidate: Pick<Rule, 'field' | 'match' | 'pattern' | 'categoryId'>,
  originId: string,
): number {
  const withCandidate = insertRule(rules, { id: CANDIDATE_RULE_ID, priority: 0, ...candidate });

  let count = 0;
  for (const row of rows) {
    const manualCategoryId = row.id === originId ? null : row.manualCategoryId;
    const assignment = assignCategory({ ...row, manualCategoryId }, withCandidate);
    if (assignment.ruleId === CANDIDATE_RULE_ID) count += 1;
  }
  return count;
}
