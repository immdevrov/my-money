import type { CategorySource, DerivedFields, Rule, StoredTransaction } from '../domain/types';
import { CURRENCY_CONVERSION_ID } from './seed';

export type Candidate = Pick<StoredTransaction, 'details' | 'manualCategoryId'> &
  Pick<DerivedFields, 'counterparty' | 'mcc' | 'kind'> & { paired: boolean };

export type Assignment = {
  categoryId: string | null;
  categorySource: CategorySource | null;
  ruleId: string | null;
};

const UNCATEGORIZED: Assignment = { categoryId: null, categorySource: null, ruleId: null };

function fieldValue(field: Rule['field'], row: Candidate): string | null {
  switch (field) {
    case 'counterparty':
      return row.counterparty;
    case 'mcc':
      return row.mcc;
    case 'details':
      return row.details;
    case 'kind':
      return row.kind;
  }
}

export function matchesRule(rule: Rule, row: Candidate): boolean {
  const value = fieldValue(rule.field, row);
  if (value === null) return false;

  switch (rule.match) {
    case 'equals':
      return value.trim().toLowerCase() === rule.pattern.trim().toLowerCase();
    case 'contains':
      return value.toLowerCase().includes(rule.pattern.toLowerCase());
    case 'regex': {
      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern);
      } catch {
        return false;
      }
      return regex.test(value);
    }
  }
}

function byPriorityThenId(a: Rule, b: Rule): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function assignCategory(row: Candidate, rules: Rule[]): Assignment {
  if (row.paired) {
    return { categoryId: CURRENCY_CONVERSION_ID, categorySource: 'system', ruleId: null };
  }

  if (row.manualCategoryId !== null) {
    return { categoryId: row.manualCategoryId, categorySource: 'manual', ruleId: null };
  }

  for (const rule of [...rules].sort(byPriorityThenId)) {
    if (matchesRule(rule, row)) {
      return { categoryId: rule.categoryId, categorySource: 'rule', ruleId: rule.id };
    }
  }

  return UNCATEGORIZED;
}
