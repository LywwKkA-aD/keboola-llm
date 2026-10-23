import { CONDITIONAL_RULES, OPERATIONS } from './operations-snapshot.ts';
import type { Category } from './types.ts';

export interface OperationInfo {
  readonly name: string;
  readonly category: Category;
  readonly acceptsProject: boolean;
  readonly acceptsBranch: boolean;
}

const BY_NAME: ReadonlyMap<string, OperationInfo> = new Map(
  OPERATIONS.map(([name, category, scope]) => [
    name,
    { name, category, acceptsProject: scope.includes('p'), acceptsBranch: scope.includes('b') },
  ]),
);

const GROUPS: ReadonlySet<string> = new Set(OPERATIONS.map(([name]) => name.split('.')[0] ?? name));

/** True when the word is a known top-level command group, e.g. "config". */
export const isKnownGroup = (word: string): boolean => GROUPS.has(word);

const SEVERITY: Readonly<Record<Category, number>> = { read: 0, write: 1, destructive: 2, admin: 3 };

/** Longest run of leading command words that names a known operation, e.g. ['semantic-layer','model','list']. */
export function lookupOperation(commandWords: readonly string[]): OperationInfo | undefined {
  const lengths = commandWords.map((_, i) => commandWords.length - i);
  return lengths.map((n) => BY_NAME.get(commandWords.slice(0, n).join('.'))).find(Boolean);
}

const containsSequence = (tokens: readonly string[], sequence: readonly string[]) =>
  tokens.some((_, start) => sequence.every((part, offset) => tokens[start + offset] === part));

/** Category of an operation, escalated by conditional rules such as `sync.push --force`. */
export function categorize(operation: OperationInfo, tokens: readonly string[]): Category {
  return CONDITIONAL_RULES.filter((rule) => rule.operation === operation.name)
    .filter((rule) => containsSequence(tokens, rule.when))
    .map((rule) => rule.category)
    .reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst), operation.category);
}
