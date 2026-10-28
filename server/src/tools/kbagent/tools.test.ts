import { ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { buildChildEnv } from './env.ts';
import type { ExecFn, ExecOptions } from './runner.ts';
import { createKbagentSqlTool, createKbagentTools } from './tools.ts';

interface Call {
  readonly file: string;
  readonly args: readonly string[];
  readonly options: ExecOptions;
}

const recordingExec = (stdout = '{"status":"ok","data":[]}', exitCode = 0) => {
  const calls: Call[] = [];
  const exec: ExecFn = async (file, args, options) => {
    calls.push({ file, args, options });
    return { exitCode, stdout, stderr: '', timedOut: false };
  };
  return { calls, exec };
};

const byName = (tools: ReturnType<typeof createKbagentTools>, name: string) => {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
};

describe('createKbagentTools', () => {
  it('offers only the read tool for read access and both tools for write access', () => {
    expect(createKbagentTools({ access: 'read' }).map((t) => t.name)).toEqual(['kbagent_read']);
    expect(createKbagentTools({ access: 'write' }).map((t) => t.name)).toEqual(['kbagent_read', 'kbagent_write']);
  });

  it('always runs the read tool behind --deny-writes, even for write-capable agents', async () => {
    const { calls, exec } = recordingExec();
    const tools = createKbagentTools({ access: 'write', project: 'sandbox', exec });
    await byName(tools, 'kbagent_read').invoke({ args: ['config', 'list'], purpose: 'list configs' });
    expect(calls[0]?.args).toEqual(['--json', '--deny-writes', 'config', 'list', '--project', 'sandbox']);
  });

  it('runs the write tool behind --deny-destructive', async () => {
    const { calls, exec } = recordingExec();
    const tools = createKbagentTools({ access: 'write', project: 'sandbox', branch: 42, exec });
    await byName(tools, 'kbagent_write').invoke({ args: ['branch', 'create', '--name', 'fix'], purpose: 'dev branch' });
    expect(calls[0]?.args.slice(0, 2)).toEqual(['--json', '--deny-destructive']);
  });

  it('rejects disallowed commands without running kbagent', async () => {
    const { calls, exec } = recordingExec();
    const result = await createKbagentTools({ access: 'read', exec })[0]?.invoke({
      args: ['auth', 'status'],
      purpose: 'check login',
    });
    expect(result).toMatch(/^Rejected: kbagent auth is not available/);
    expect(calls).toHaveLength(0);
  });

  it('returns compact JSON for successful calls', async () => {
    const { exec } = recordingExec('{"status":"ok","data":{"jobs":[]}}');
    const result = await createKbagentTools({ access: 'read', exec })[0]?.invoke({ args: ['job', 'list'], purpose: 'jobs' });
    expect(result).toBe('{"status":"ok","data":{"jobs":[]}}');
  });

  it('includes the exit code and hint for failed calls', async () => {
    const { exec } = recordingExec('{"status":"error","error":{"code":"CONFIG_ERROR"}}', 5);
    const result = await createKbagentTools({ access: 'read', exec })[0]?.invoke({ args: ['job', 'list'], purpose: 'jobs' });
    expect(JSON.parse(String(result))).toMatchObject({ ok: false, exitCode: 5, hint: expect.stringMatching(/configuration/i) });
  });

  it('returns plain text output as is', async () => {
    const { exec } = recordingExec('Usage: kbagent job list');
    const result = await createKbagentTools({ access: 'read', exec })[0]?.invoke({ args: ['job', 'list', '--help'], purpose: 'help' });
    expect(result).toBe('Usage: kbagent job list');
  });

  it('uses the thread id as the conversation id', async () => {
    const { calls, exec } = recordingExec();
    const tool = createKbagentTools({ access: 'read', exec })[0];
    await tool?.invoke({ args: ['job', 'list'], purpose: 'jobs' }, { configurable: { thread_id: 'thread-7' } });
    await tool?.invoke({ args: ['job', 'list'], purpose: 'jobs' }, { configurable: { thread_id: 'bad id!' } });
    expect(calls[0]?.args).toContain('thread-7');
    expect(calls[1]?.args).not.toContain('--conversation-id');
  });

  it('attaches operation details as a tool-message artifact for the UI', async () => {
    const { exec } = recordingExec();
    const message = await createKbagentTools({ access: 'read', project: 'sandbox', exec })[0]?.invoke({
      id: 'call_1',
      name: 'kbagent_read',
      args: { args: ['config', 'list'], purpose: 'list configs' },
      type: 'tool_call',
    });
    expect(message).toBeInstanceOf(ToolMessage);
    expect((message as ToolMessage).artifact).toEqual({
      operation: 'config.list',
      category: 'read',
      ok: true,
      exitCode: 0,
      purpose: 'list configs',
    });
  });

  it('validates the input schema', async () => {
    const tool = createKbagentTools({ access: 'read', exec: recordingExec().exec })[0];
    await expect(tool?.invoke({ args: [], purpose: 'x' })).rejects.toThrow();
    await expect(tool?.invoke({ args: ['job', 'list'] } as never)).rejects.toThrow();
  });

  it('passes a filtered environment to kbagent', async () => {
    const { calls, exec } = recordingExec();
    const env = { PATH: '/usr/bin', OPENAI_API_KEY: 'secret', KBC_TOKEN: 'secret', KBAGENT_SERVE_TOKEN: 'secret' };
    await createKbagentTools({ access: 'read', configDir: '/cfg', env, exec })[0]?.invoke({ args: ['job', 'list'], purpose: 'jobs' });
    expect(calls[0]?.options.env).toMatchObject({ PATH: '/usr/bin', KBAGENT_CONFIG_DIR: '/cfg' });
    expect(calls[0]?.options.env).not.toHaveProperty('OPENAI_API_KEY');
    expect(calls[0]?.options.env).not.toHaveProperty('KBC_TOKEN');
  });
});

describe('kbagent_write without a pinned branch', () => {
  const BRANCHES = JSON.stringify({ status: 'ok', data: { branches: [{ id: 57656, name: 'Main', isDefault: true }, { id: 99, name: 'agent/fix', isDefault: false }] } });

  /** Answers `branch list` with BRANCHES (or a failure) and everything else with a plain ok. */
  const scriptedExec = ({ branchList = BRANCHES, branchListExit = 0 } = {}) => {
    const calls: Call[] = [];
    const exec: ExecFn = async (file, args, options) => {
      calls.push({ file, args, options });
      const listing = args.includes('branch') && args.includes('list');
      return { exitCode: listing ? branchListExit : 0, stdout: listing ? branchList : '{"status":"ok","data":{}}', stderr: '', timedOut: false };
    };
    return { calls, exec };
  };
  const writeTool = (exec: ExecFn) => byName(createKbagentTools({ access: 'write', project: 'sandbox', exec }), 'kbagent_write');
  const update = (branch: string) => ({ args: ['config', 'update', '--component-id', 'c', '--config-id', '1', '--set', 'a=1', '--branch', branch], purpose: 'change' });

  it('finds the production branch once and runs writes on development branches only', async () => {
    const { calls, exec } = scriptedExec();
    const tool = writeTool(exec);
    await tool.invoke(update('99'));
    await tool.invoke(update('99'));
    expect(calls.map((call) => call.args.join(' '))).toEqual([
      '--json --deny-writes branch list --project sandbox',
      '--json --deny-destructive config update --component-id c --config-id 1 --set a=1 --branch 99 --project sandbox',
      '--json --deny-destructive config update --component-id c --config-id 1 --set a=1 --branch 99 --project sandbox',
    ]);

    const rejected = await tool.invoke(update('57656'));
    expect(String(rejected)).toMatch(/production/i);
    expect(calls).toHaveLength(3);
  });

  it('refuses writes when the production branch cannot be read', async () => {
    const { calls, exec } = scriptedExec({ branchListExit: 1, branchList: '{"status":"error"}' });
    const result = await writeTool(exec).invoke(update('99'));
    expect(String(result)).toMatch(/production branch/i);
    expect(calls).toHaveLength(1);
  });

  it('puts kbagent back on production after creating a branch, so other agents keep reading production', async () => {
    const { calls, exec } = scriptedExec();
    await writeTool(exec).invoke({ args: ['branch', 'create', '--name', 'agent/fix'], purpose: 'dev branch' });
    expect(calls.map((call) => call.args.join(' ')).slice(1)).toEqual([
      '--json --deny-destructive branch create --name agent/fix --project sandbox',
      '--json --deny-destructive branch reset --project sandbox',
    ]);
  });
});

describe('createKbagentSqlTool', () => {
  it('is named kbagent_sql and runs workspace queries behind --deny-destructive', async () => {
    const { calls, exec } = recordingExec('{"status":"ok","data":{"statements":[]}}');
    const sql = createKbagentSqlTool({ project: 'sandbox', exec });
    expect(sql.name).toBe('kbagent_sql');

    await sql.invoke({ args: ['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1'], purpose: 'count rows' });
    expect(calls[0]?.args).toEqual([
      '--json',
      '--deny-destructive',
      'workspace',
      'query',
      '--workspace-id',
      '7',
      '--sql',
      'SELECT 1',
      '--project',
      'sandbox',
    ]);
  });

  it('rejects non-workspace commands without running kbagent', async () => {
    const { calls, exec } = recordingExec();
    const result = await createKbagentSqlTool({ exec }).invoke({
      args: ['config', 'update', '--component-id', 'c', '--config-id', '1'],
      purpose: 'change config',
    });
    expect(result).toMatch(/^Rejected: .*only runs workspace commands/);
    expect(calls).toHaveLength(0);
  });

  it('never hands workspace passwords to the model', async () => {
    const { exec } = recordingExec('{"status":"ok","data":{"workspace_id":7,"password":"s3cret"}}');
    const result = await createKbagentSqlTool({ exec }).invoke({ args: ['workspace', 'create', '--name', 'agent-ws'], purpose: 'ws' });
    expect(result).not.toContain('s3cret');
  });

  it('documents approval and result caps for the model', () => {
    const { description } = createKbagentSqlTool({ exec: recordingExec().exec });
    expect(description).toMatch(/approv/i);
    expect(description).toMatch(/--limit/);
  });
});

describe('buildChildEnv', () => {
  it('keeps system variables and harmless kbagent preferences only', () => {
    const env = buildChildEnv({
      parentEnv: {
        PATH: '/bin',
        APPDATA: 'C:\\Users\\a\\AppData\\Roaming',
        KBAGENT_DISABLE_TELEMETRY: '1',
        KBAGENT_SERVE_TOKEN: 'x',
        KBAGENT_CONFIG_DIR: 'D:\\kbagent',
        KBC_MANAGE_API_TOKEN: 'x',
        AWS_SECRET_ACCESS_KEY: 'x',
      },
    });
    // The user's own config dir comes along: kbagent in the app must see the projects her terminal sees.
    expect(env).toEqual({
      PATH: '/bin',
      APPDATA: 'C:\\Users\\a\\AppData\\Roaming',
      KBAGENT_DISABLE_TELEMETRY: '1',
      KBAGENT_CONFIG_DIR: 'D:\\kbagent',
      KBAGENT_AUTO_UPDATE: 'false',
      NO_COLOR: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    });
  });

  it('matches Windows system variables whatever their case', () => {
    const env = buildChildEnv({
      parentEnv: { Path: 'C:\\bin', windir: 'C:\\Windows', SystemDrive: 'C:', USERNAME: 'analyst', Https_Proxy: 'http://proxy:8080', OPENAI_API_KEY: 'x' },
    });
    expect(env).toMatchObject({ Path: 'C:\\bin', windir: 'C:\\Windows', SystemDrive: 'C:', USERNAME: 'analyst', Https_Proxy: 'http://proxy:8080' });
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('pins the config dir and project over the user\'s, and merges explicit per-agent variables last', () => {
    const env = buildChildEnv({
      parentEnv: { PATH: '/bin', KBAGENT_CONFIG_DIR: '/users/own' },
      configDir: '/agents/sql/kbagent',
      project: 'sandbox',
      extraEnv: { KBAGENT_PROJECT_FROM_ENV: '1', KBC_TOKEN: 'per-agent', KBC_STORAGE_API_URL: 'https://connection.keboola.com' },
    });
    expect(env).toMatchObject({
      KBAGENT_CONFIG_DIR: '/agents/sql/kbagent',
      KBAGENT_PROJECT: 'sandbox',
      KBAGENT_PROJECT_FROM_ENV: '1',
      KBC_TOKEN: 'per-agent',
    });
  });
});

describe.skipIf(process.env.KBAGENT_IT !== '1')('kbagent integration', () => {
  it('lists registered projects through the real CLI', async () => {
    const result = await createKbagentTools({ access: 'read' })[0]?.invoke({ args: ['project', 'list'], purpose: 'it' });
    expect(JSON.parse(String(result))).toMatchObject({ status: 'ok' });
  }, 60_000);
});
