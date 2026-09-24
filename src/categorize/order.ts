import type { Rule } from '../domain/types';

export function byPriorityThenId(a: Rule, b: Rule): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function renumber(rules: Rule[]): Rule[] {
  return rules.map((rule, index) => ({ ...rule, priority: (index + 1) * 10 }));
}

export function insertRule(rules: Rule[], rule: Rule): Rule[] {
  return renumber([rule, ...[...rules].sort(byPriorityThenId)]);
}

export function moveRule(rules: Rule[], id: string, direction: 'up' | 'down'): Rule[] {
  const ordered = [...rules].sort(byPriorityThenId);
  const index = ordered.findIndex((rule) => rule.id === id);
  if (index === -1) return renumber(ordered);

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return renumber(ordered);

  const swapped = [...ordered];
  const a = swapped[index]!;
  const b = swapped[target]!;
  swapped[index] = b;
  swapped[target] = a;
  return renumber(swapped);
}
