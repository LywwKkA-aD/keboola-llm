/** Risk category kbagent assigns to every operation (`kbagent permissions list`). */
export type Category = 'read' | 'write' | 'destructive' | 'admin';

/** Access level of a tool: read-only, or read + non-destructive writes. */
export type Access = 'read' | 'write';

/** [operation, category, scope]: scope letters p = accepts --project, b = accepts --branch. */
export type OperationEntry = readonly [name: string, category: Category, scope: string];

/** An operation whose category escalates when the given tokens appear, e.g. `sync.push --force`. */
export interface ConditionalRule {
  readonly operation: string;
  readonly when: readonly string[];
  readonly category: Category;
}

export type InvocationResult =
  | { readonly ok: true; readonly argv: readonly string[]; readonly operation: string; readonly category: Category }
  | { readonly ok: false; readonly reason: string };
