/**
 * The SQL path: only the workspace operations an agent needs to query data. kbagent classifies
 * creating, loading and querying workspaces as writes, so these calls run behind
 * --deny-destructive and wait for the user's approval unless SQL is allowed for the chat.
 */
import { buildInvocation, type InvocationRequest } from './policy.ts';
import type { InvocationResult } from './types.ts';

export const SQL_OPERATIONS: ReadonlySet<string> = new Set([
  'workspace.list',
  'workspace.detail',
  'workspace.create',
  'workspace.load',
  'workspace.query',
  'workspace.from-transformation',
]);

/** Flags that make an otherwise routine call worth a human look (here: COPY loads over 1 GB). */
const NEEDS_HUMAN_FLAGS: ReadonlySet<string> = new Set(['--force']);

export function sqlInvocation(request: Omit<InvocationRequest, 'access' | 'operations'>): InvocationResult {
  return buildInvocation({ ...request, access: 'write', operations: SQL_OPERATIONS });
}

function routineInvocation(args: unknown): InvocationResult | undefined {
  if (!Array.isArray(args) || !args.every((token) => typeof token === 'string')) return undefined;
  if (args.some((token) => NEEDS_HUMAN_FLAGS.has(token.split('=', 1)[0] ?? token))) return undefined;
  return sqlInvocation({ args });
}

/** True when a kbagent_sql call may run without asking, given the user allowed SQL for the chat. */
export function isAutoApprovableSqlCall(args: unknown): boolean {
  const result = routineInvocation(args);
  return result?.ok === true && SQL_OPERATIONS.has(result.operation);
}

/** True for kbagent_sql calls kbagent itself classifies as reads (listing or inspecting workspaces). */
export function isReadOnlySqlCall(args: unknown): boolean {
  const result = routineInvocation(args);
  return result?.ok === true && result.category === 'read';
}
