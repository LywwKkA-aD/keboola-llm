import { describe, expect, it } from 'vitest';
import { buildInvocation } from './policy.ts';
import { isAutoApprovableSqlCall, SQL_OPERATIONS, sqlInvocation } from './sql.ts';

const reasonOf = (result: ReturnType<typeof buildInvocation>) => {
  if (result.ok) throw new Error(`expected rejection, got argv: ${result.argv.join(' ')}`);
  return result.reason;
};

describe('SQL_OPERATIONS', () => {
  it('lists only the workspace operations needed to query data', () => {
    expect([...SQL_OPERATIONS].toSorted()).toEqual([
      'workspace.create',
      'workspace.detail',
      'workspace.from-transformation',
      'workspace.list',
      'workspace.load',
      'workspace.query',
    ]);
  });
});

describe('sqlInvocation', () => {
  it('runs workspace commands behind --deny-destructive with the project pinned', () => {
    const result = sqlInvocation({ args: ['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1'], project: 'sandbox' });
    expect(result).toEqual({
      ok: true,
      argv: ['--json', '--deny-destructive', 'workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1', '--project', 'sandbox'],
      operation: 'workspace.query',
      category: 'write',
    });
  });

  it('accepts read-only workspace commands', () => {
    expect(sqlInvocation({ args: ['workspace', 'list'] })).toMatchObject({ ok: true, operation: 'workspace.list' });
  });

  it('rejects anything outside the workspace query operations', () => {
    expect(reasonOf(sqlInvocation({ args: ['config', 'update', '--component-id', 'c', '--config-id', '1'] }))).toMatch(
      /only runs workspace commands/,
    );
    expect(reasonOf(sqlInvocation({ args: ['workspace', 'sql-improve'] }))).toMatch(/only runs workspace commands/);
    expect(reasonOf(sqlInvocation({ args: ['job', 'list'] }))).toMatch(/only runs workspace commands/);
  });

  it('keeps blocking destructive workspace operations and the shared flag rules', () => {
    expect(reasonOf(sqlInvocation({ args: ['workspace', 'delete', '--workspace-id', '7'] }))).toMatch(/destructive/);
    expect(reasonOf(sqlInvocation({ args: ['workspace', 'password', '--workspace-id', '7'] }))).toMatch(/destructive/);
    expect(reasonOf(sqlInvocation({ args: ['workspace', 'query', '--workspace-id', '7', '--file', 'q.sql'] }))).toMatch(/--file/);
  });

  it('allows help for the workspace group only', () => {
    expect(sqlInvocation({ args: ['workspace', '--help'] }).ok).toBe(true);
    expect(sqlInvocation({ args: ['workspace', 'query', '--help'] }).ok).toBe(true);
    expect(sqlInvocation({ args: ['config', '--help'] }).ok).toBe(false);
  });
});

describe('isAutoApprovableSqlCall', () => {
  it('approves allowed workspace calls', () => {
    expect(isAutoApprovableSqlCall(['workspace', 'create', '--name', 'agent-ws'])).toBe(true);
    expect(isAutoApprovableSqlCall(['workspace', 'load', '--workspace-id', '7', '--tables', 'in.c-crm.orders'])).toBe(true);
    expect(isAutoApprovableSqlCall(['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1'])).toBe(true);
  });

  it('never auto-approves calls the tool would reject or large forced loads', () => {
    expect(isAutoApprovableSqlCall(['config', 'update'])).toBe(false);
    expect(isAutoApprovableSqlCall(['workspace', 'delete', '--workspace-id', '7'])).toBe(false);
    expect(isAutoApprovableSqlCall(['workspace', 'load', '--workspace-id', '7', '--tables', 't', '--force'])).toBe(false);
    expect(isAutoApprovableSqlCall('workspace query' as never)).toBe(false);
  });
});

describe('buildInvocation with an operation allowlist', () => {
  it('leaves callers without an allowlist unaffected', () => {
    expect(buildInvocation({ args: ['config', 'list'], access: 'read' }).ok).toBe(true);
  });
});
