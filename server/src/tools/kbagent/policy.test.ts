import { describe, expect, it } from 'vitest';
import { buildInvocation, operationOf } from './policy.ts';
import type { InvocationRequest } from './policy.ts';

const read = (args: string[], extra: Partial<InvocationRequest> = {}) =>
  buildInvocation({ args, access: 'read', ...extra });
const write = (args: string[], extra: Partial<InvocationRequest> = {}) =>
  buildInvocation({ args, access: 'write', ...extra });

const argvOf = (result: ReturnType<typeof buildInvocation>) => {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.argv;
};
const reasonOf = (result: ReturnType<typeof buildInvocation>) => {
  if (result.ok) throw new Error(`expected rejection, got argv: ${result.argv.join(' ')}`);
  return result.reason;
};

describe('buildInvocation: global flags', () => {
  it('puts --json and --deny-writes before the command for read access', () => {
    const result = read(['config', 'list']);
    expect(result).toEqual({
      ok: true,
      argv: ['--json', '--deny-writes', 'config', 'list'],
      operation: 'config.list',
      category: 'read',
    });
  });

  it('uses --deny-destructive for write access', () => {
    expect(argvOf(write(['branch', 'create', '--name', 'fix-orders'])).slice(0, 2)).toEqual([
      '--json',
      '--deny-destructive',
    ]);
  });

  it('adds the conversation id as a global flag', () => {
    expect(argvOf(read(['job', 'list'], { conversationId: 'thread-1' })).slice(0, 4)).toEqual([
      '--json',
      '--deny-writes',
      '--conversation-id',
      'thread-1',
    ]);
  });

  it('rejects a conversation id that could be parsed as a flag', () => {
    expect(reasonOf(read(['job', 'list'], { conversationId: '--config-dir' }))).toMatch(/conversation id/i);
  });

  it('drops duplicate --json / -j / --no-color supplied by the agent', () => {
    expect(argvOf(read(['--json', 'config', 'list', '-j', '--no-color']))).toEqual([
      '--json',
      '--deny-writes',
      'config',
      'list',
    ]);
  });
});

describe('buildInvocation: operation resolution', () => {
  it('resolves positional queries to the base command', () => {
    expect(read(['search', 'customer_id', '--search-type', 'config-based'])).toMatchObject({
      ok: true,
      operation: 'search',
    });
  });

  it('resolves three-level commands', () => {
    expect(read(['semantic-layer', 'model', 'list'])).toMatchObject({ ok: true, operation: 'semantic-layer.model.list' });
  });

  it('rejects unknown commands', () => {
    expect(reasonOf(read(['frobnicate']))).toMatch(/unknown/i);
  });

  it('rejects empty args and args that start with a flag', () => {
    expect(reasonOf(read([]))).toMatch(/command/i);
    expect(reasonOf(read(['--verbose', 'config', 'list']))).toMatch(/start with the command/i);
  });
});

describe('operationOf', () => {
  it('names the operation for UI labels without applying the policy', () => {
    expect(operationOf(['--json', 'storage', 'delete-table', '--table-id', 'x'])).toBe('storage.delete-table');
    expect(operationOf(['search', 'orders'])).toBe('search');
    expect(operationOf(['nonsense'])).toBeUndefined();
  });
});

describe('buildInvocation: categories', () => {
  it('sends write operations from the read tool to kbagent_write', () => {
    expect(reasonOf(read(['branch', 'create', '--name', 'x']))).toMatch(/kbagent_write/);
  });

  it('never allows destructive operations', () => {
    expect(reasonOf(write(['storage', 'delete-table', '--table-id', 'in.c-a.b']))).toMatch(/human/i);
    expect(reasonOf(write(['merge-request', 'merge', '--merge-request-id', '1']))).toMatch(/human/i);
  });

  it('escalates conditional rules such as variables-set --replace', () => {
    const onDevBranch = { productionBranch: '1' };
    expect(write(['config', 'variables-set', '--component-id', 'c', '--config-id', '1', '--branch', '99'], onDevBranch)).toMatchObject({ ok: true });
    expect(reasonOf(write(['config', 'variables-set', '--component-id', 'c', '--config-id', '1', '--replace']))).toMatch(
      /destructive/i,
    );
  });

  it('allows --help on any known command as a read', () => {
    expect(argvOf(read(['branch', 'create', '--help'], { project: 'sandbox' }))).toEqual([
      '--json',
      '--deny-writes',
      'branch',
      'create',
      '--help',
    ]);
  });
});

describe('buildInvocation: denied groups and operations', () => {
  it.each([
    [['auth', 'status']],
    [['token', 'list']],
    [['permissions', 'list']],
    [['http', 'get', '/openapi.json']],
    [['agent', 'list']],
    [['kai', 'ask', 'hi']],
    [['sync', 'pull']],
    [['update']],
    [['serve']],
    [['repl']],
    [['org', 'setup']],
    [['feature', 'list']],
    [['dev-portal', 'list']],
  ])('rejects %j', (args) => {
    expect(read(args).ok).toBe(false);
  });

  it.each([
    [['data-app', 'password', '--app-id', '1']],
    [['data-app', 'secrets-get', '--app-id', '1', '--key', 'k']],
    [['storage', 'download-table', '--table-id', 'in.c-a.b']],
    [['lineage', 'server']],
    [['project', 'member-list']],
    [['branch', 'use', '--branch', '1']],
  ])('rejects sensitive read operation %j', (args) => {
    expect(read(args).ok).toBe(false);
  });

  it.each([
    [['project', 'use', '--project', 'x']],
    [['sharing', 'share', '--bucket-id', 'in.c-a']],
    [['storage', 'upload-table', '--table-id', 'in.c-a.b']],
    [['semantic-layer', 'token']],
  ])('rejects sensitive write operation %j', (args) => {
    expect(write(args).ok).toBe(false);
  });
});

describe('buildInvocation: argument safety', () => {
  it.each([
    ['--config-dir', '/tmp/x'],
    ['--token', 'abc'],
    ['--token-stdin'],
    ['--allow-env-manage-token'],
    ['--deny-writes'],
    ['--reveal'],
    ['--copy'],
    ['--output', 'out.csv'],
    ['--output-dir', 'out'],
    ['--file', 'q.sql'],
    ['--directory', '.'],
    ['--configuration-file', 'body.json'],
  ])('rejects forbidden flag %s', (...flag) => {
    expect(reasonOf(write(['config', 'list', ...flag]))).toMatch(/not allowed/i);
  });

  it('rejects forbidden flags written as --flag=value', () => {
    expect(read(['config', 'list', '--config-dir=/tmp/x']).ok).toBe(false);
  });

  it('rejects short flags with a hint to use the long form', () => {
    expect(reasonOf(read(['search', 'x', '-p', 'other']))).toMatch(/long/i);
  });

  it('rejects @file references and stdin markers', () => {
    expect(reasonOf(write(['config', 'update', '--configuration', '@body.json']))).toMatch(/file/i);
    expect(read(['search', '-']).ok).toBe(false);
  });

  it('rejects NUL bytes anywhere and newlines in commands or flags', () => {
    expect(read(['search', 'a\u0000b']).ok).toBe(false);
    expect(read(['config\n', 'list']).ok).toBe(false);
  });

  it('keeps multi-line SQL values, including ones that start with a SQL comment', () => {
    const sql = '-- check orders\nSELECT COUNT(*)\nFROM "orders"';
    const argv = argvOf(write(['workspace', 'query', '--workspace-id', '1', '--sql', sql]));
    expect(argv).toContain(sql);
  });

  it('rejects non-string arguments', () => {
    expect(read(['config', 42 as unknown as string]).ok).toBe(false);
  });
});

describe('buildInvocation: project scoping', () => {
  it('injects the configured project when the command accepts it', () => {
    expect(argvOf(read(['config', 'list'], { project: 'sandbox' })).slice(-2)).toEqual(['--project', 'sandbox']);
  });

  it('does not inject a project into commands without --project', () => {
    expect(argvOf(read(['project', 'list'], { project: 'sandbox' }))).not.toContain('--project');
  });

  it('accepts the same project from the agent without duplicating it', () => {
    const argv = argvOf(read(['config', 'list', '--project', 'sandbox'], { project: 'sandbox' }));
    expect(argv.filter((token) => token === '--project')).toHaveLength(1);
  });

  it('rejects a different project, --all-projects and cross-project flags', () => {
    expect(reasonOf(read(['config', 'list', '--project', 'prod'], { project: 'sandbox' }))).toMatch(/sandbox/);
    expect(reasonOf(read(['config', 'list', '--project=prod'], { project: 'sandbox' }))).toMatch(/sandbox/);
    expect(read(['config', 'list', '--all-projects'], { project: 'sandbox' }).ok).toBe(false);
    expect(read(['semantic-layer', 'diff', '--project-a', 'x', '--project-b', 'y'], { project: 'sandbox' }).ok).toBe(
      false,
    );
  });

  it('leaves project selection to the agent when none is configured', () => {
    expect(argvOf(read(['config', 'list', '--project', 'prod']))).toEqual([
      '--json',
      '--deny-writes',
      'config',
      'list',
      '--project',
      'prod',
    ]);
  });

  it('rejects organization-wide or targeted semantic-layer scope changes', () => {
    expect(write(['semantic-layer', 'add', 'metric', '--scope', 'targeted']).ok).toBe(false);
    expect(write(['semantic-layer', 'add', 'metric', '--scope', 'organization']).ok).toBe(false);
  });
});

describe('buildInvocation: branch scoping', () => {
  it('injects the configured branch where supported', () => {
    expect(argvOf(read(['config', 'list'], { project: 'sandbox', branch: 42 })).slice(-4)).toEqual([
      '--project',
      'sandbox',
      '--branch',
      '42',
    ]);
  });

  it('does not inject a branch into commands without --branch', () => {
    expect(argvOf(read(['job', 'list'], { branch: '42' }))).not.toContain('--branch');
  });

  it('rejects a different branch from the agent', () => {
    expect(reasonOf(read(['config', 'list', '--branch', '7'], { branch: '42' }))).toMatch(/42/);
  });

  it('blocks writes that cannot be scoped to the branch', () => {
    expect(reasonOf(write(['storage', 'file-tag', '--file-id', '1', '--add', 'x'], { branch: '42' }))).toMatch(
      /production/i,
    );
  });

  it('allows branch-agnostic writes such as workspace queries', () => {
    expect(write(['workspace', 'query', '--workspace-id', '1', '--sql', 'SELECT 1'], { branch: '42' }).ok).toBe(true);
    expect(write(['branch', 'create', '--name', 'x'], { branch: '42' }).ok).toBe(true);
  });

});

describe('buildInvocation: production stays read-only', () => {
  const prod = { productionBranch: '57656' };
  const update = (...branch: string[]) => ['config', 'update', '--component-id', 'c', '--config-id', '1', '--set', 'a=1', ...branch];

  it('allows writes on a development branch the agent names', () => {
    const argv = argvOf(write(['transformation', 'edit', '--config-id', '1', '--change-description', 'x', '--op', '{}', '--branch', '99'], prod));
    expect(argv.slice(0, 2)).toEqual(['--json', '--deny-destructive']);
    expect(argv.slice(-2)).toEqual(['--branch', '99']);
    expect(write(update('--branch=99'), prod).ok).toBe(true);
  });

  it('rejects writes that do not name a development branch', () => {
    expect(reasonOf(write(update(), prod))).toMatch(/--branch/);
  });

  it('rejects writes to the production branch, by its id or as 0', () => {
    expect(reasonOf(write(update('--branch', '57656'), prod))).toMatch(/production/i);
    expect(reasonOf(write(update('--branch=57656'), prod))).toMatch(/production/i);
    expect(reasonOf(write(update('--branch', '0'), prod))).toMatch(/production/i);
    expect(reasonOf(write(update('--branch', '99', '--branch', '57656'), prod))).toMatch(/production/i);
  });

  it('blocks writes that cannot be limited to a branch', () => {
    expect(reasonOf(write(['storage', 'file-tag', '--file-id', '1', '--add', 'x'], prod))).toMatch(/production/i);
  });

  it('allows branch creation and workspace work, which never change production data', () => {
    expect(write(['branch', 'create', '--name', 'agent/fix-orders'], prod).ok).toBe(true);
    expect(write(['workspace', 'query', '--workspace-id', '1', '--sql', 'SELECT 1'], prod).ok).toBe(true);
  });

  it('refuses writes while the production branch is unknown', () => {
    expect(reasonOf(write(update('--branch', '99')))).toMatch(/production branch/i);
  });

  it('never merges a branch into production: the user does that in Keboola', () => {
    expect(reasonOf(write(['branch', 'merge', '--branch', '99'], prod))).toMatch(/merge request/i);
    expect(write(['merge-request', 'create', '--title', 'Fix fan-out', '--branch', '99'], prod).ok).toBe(true);
  });

  it('leaves reads alone', () => {
    expect(read(['config', 'list']).ok).toBe(true);
    expect(read(['config', 'list', '--branch', '57656'], prod).ok).toBe(true);
  });
});
