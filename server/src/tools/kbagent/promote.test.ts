import { describe, expect, it } from 'vitest';
import type { ExecFn } from './runner.ts';
import { createKbagentPromoteTool, PROMOTE_TOOL } from './promote.ts';

const PROD = '57656';
const DEV = '99';
const config = (version: number, sql: string, rows: unknown[] = []) => ({
  id: 'k1',
  version,
  configuration: { parameters: { blocks: [{ name: 'Blocks', codes: [{ name: 'Code', script: [sql] }] }] }, storage: { input: { tables: [] } } },
  rows,
});

/** A scripted kbagent: branch list, config detail per branch, config update; records every call. */
function kbagent({ prod = config(4, 'SELECT 1'), dev = config(2, 'SELECT 2'), after = config(5, 'SELECT 2'), updateExit = 0 } = {}) {
  const calls: string[] = [];
  let updated = false;
  const exec: ExecFn = async (_file, args) => {
    calls.push(args.join(' '));
    const json = (data: unknown, exitCode = 0) => ({ exitCode, stdout: JSON.stringify({ status: exitCode ? 'error' : 'ok', data }), stderr: '', timedOut: false });
    if (args.includes('branch') && args.includes('list')) return json({ branches: [{ id: Number(PROD), isDefault: true }, { id: Number(DEV), isDefault: false }] });
    if (args.includes('update')) {
      updated = updateExit === 0;
      return json({ version: after.version }, updateExit);
    }
    const branch = args[args.indexOf('--branch') + 1];
    if (branch === DEV) return json(dev);
    return json(updated ? after : prod);
  };
  return { exec, calls };
}

const promote = (exec: ExecFn) => createKbagentPromoteTool({ project: 'sandbox', exec });
const input = (overrides: Record<string, unknown> = {}) => ({
  component_id: 'keboola.google-bigquery-transformation',
  config_id: 'k1',
  branch_id: DEV,
  production_version: 4,
  summary: 'Add the shipping fee once per order',
  ...overrides,
});

describe(PROMOTE_TOOL, () => {
  it('copies the branch configuration into production itself and checks the result', async () => {
    const { exec, calls } = kbagent();
    const result = String(await promote(exec).invoke(input()));
    const update = calls.find((call) => call.includes(' update '));
    expect(update).toContain('--json --deny-destructive config update');
    expect(update).toContain(`--branch ${PROD}`);
    expect(update).toContain('--configuration {"parameters":{"blocks":[{"name":"Blocks","codes":[{"name":"Code","script":["SELECT 2"]}]}]}');
    expect(update).toContain('--change-description Promoted from development branch 99 via Agent Studio: Add the shipping fee once per order');
    expect(result).toMatch(/promoted/i);
    expect(result).toContain('version 5');
  });

  it('writes nothing when production changed since the agent read it', async () => {
    const { exec, calls } = kbagent({ prod: config(6, 'SELECT 1') });
    expect(String(await promote(exec).invoke(input()))).toMatch(/production changed.*version 4.*6/i);
    expect(calls.some((call) => call.includes(' update '))).toBe(false);
  });

  it('writes nothing when the configuration rows differ: those are promoted in Keboola', async () => {
    const { exec, calls } = kbagent({ dev: config(2, 'SELECT 2', [{ id: 'r1' }]) });
    expect(String(await promote(exec).invoke(input()))).toMatch(/rows/i);
    expect(calls.some((call) => call.includes(' update '))).toBe(false);
  });

  it('refuses a "branch" that is production, and says when there is nothing to promote', async () => {
    const prodAsBranch = kbagent();
    expect(String(await promote(prodAsBranch.exec).invoke(input({ branch_id: PROD })))).toMatch(/development branch/i);
    expect(String(await promote(prodAsBranch.exec).invoke(input({ branch_id: '0' })))).toMatch(/development branch/i);
    const same = kbagent({ dev: config(2, 'SELECT 1') });
    expect(String(await promote(same.exec).invoke(input()))).toMatch(/nothing to promote/i);
    expect([...prodAsBranch.calls, ...same.calls].some((call) => call.includes(' update '))).toBe(false);
  });

  it('reports a failed write without claiming success', async () => {
    const { exec } = kbagent({ updateExit: 1 });
    expect(String(await promote(exec).invoke(input()))).toMatch(/failed/i);
  });

  it('accepts only plain ids, never configuration content from the agent', async () => {
    const { exec } = kbagent();
    await expect(promote(exec).invoke(input({ config_id: 'k1 --configuration {}' }))).rejects.toThrow();
    expect(Object.keys((promote(exec).schema as { shape: Record<string, unknown> }).shape).toSorted()).toEqual(
      ['branch_id', 'component_id', 'config_id', 'production_version', 'summary'],
    );
  });
});
