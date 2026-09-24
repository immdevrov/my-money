import { byPriorityThenId, insertRule, moveRule } from '../categorize/order';
import type { Rule } from '../domain/types';
import { db, openDatabase } from './database';

export type RuleDraft = Pick<Rule, 'field' | 'match' | 'pattern' | 'categoryId'>;

export async function listRules(): Promise<Rule[]> {
  await openDatabase();
  const rules = await db.rules.toArray();
  return rules.sort(byPriorityThenId);
}

export async function addRule(draft: RuleDraft): Promise<void> {
  await openDatabase();
  await db.transaction('rw', db.rules, async () => {
    const existing = await db.rules.toArray();
    const rule: Rule = { id: crypto.randomUUID(), priority: 0, ...draft };
    await db.rules.bulkPut(insertRule(existing, rule));
  });
}

export async function updateRule(rule: Rule): Promise<void> {
  await openDatabase();
  await db.rules.put(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await openDatabase();
  await db.rules.delete(id);
}

export async function reorderRule(id: string, direction: 'up' | 'down'): Promise<void> {
  await openDatabase();
  await db.transaction('rw', db.rules, async () => {
    const existing = await db.rules.toArray();
    await db.rules.bulkPut(moveRule(existing, id, direction));
  });
}
