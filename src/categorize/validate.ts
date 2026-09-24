import type { RuleMatch } from '../domain/types';

export function patternError(match: RuleMatch, pattern: string): string | null {
  if (pattern.trim() === '') return 'Pattern is required.';

  if (match === 'regex') {
    try {
      new RegExp(pattern);
    } catch {
      return 'Pattern is not a valid regular expression.';
    }
  }

  return null;
}
