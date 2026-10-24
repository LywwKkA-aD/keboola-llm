import { describe, expect, it } from 'vitest';
import type { RunResult } from '../tools/kbagent/runner.ts';
import { previewPromotion, readableConfig } from './promotion.ts';

const sqlConfig = (sql: string[]) => ({
  parameters: { blocks: [{ name: 'Lake', codes: [{ name: 'Orders', script: sql }] }] },
  storage: { output: { tables: [{ source: 'fct_orders', destination: 'out.c-shop_dwh.fct_orders' }] } },
});

describe('readableConfig', () => {
  it('shows SQL transformations as their statements under block and code headers, then the mappings', () => {
    const text = readableConfig(sqlConfig(['CREATE TABLE a AS SELECT 1;', 'INSERT INTO a SELECT 2;']));
    expect(text.split('\n').slice(0, 4)).toEqual(['-- Block: Lake', '-- Code: Orders', 'CREATE TABLE a AS SELECT 1;', 'INSERT INTO a SELECT 2;']);
    expect(text).toContain('"destination": "out.c-shop_dwh.fct_orders"');
  });

  it('falls back to pretty JSON for other components', () => {
    expect(readableConfig({ parameters: { limit: 5 } })).toBe('{\n  "parameters": {\n    "limit": 5\n  }\n}');
  });
});

describe('previewPromotion', () => {
  it('reads production and the branch and returns both, read-only', async () => {
    const calls: string[][] = [];
    const run = async (argv: readonly string[]): Promise<RunResult> => {
      calls.push([...argv]);
      const branch = argv[argv.indexOf('--branch') + 1];
      const data = branch === '99' ? { version: 2, configuration: sqlConfig(['SELECT 2;']) } : { version: 4, configuration: sqlConfig(['SELECT 1;']) };
      return { ok: true, exitCode: 0, output: { status: 'ok', data }, truncated: false };
    };
    const preview = await previewPromotion({ run, production: async () => '57656', project: 'sandbox', componentId: 'c', configId: 'k1', branchId: '99' });
    expect(preview).toMatchObject({ productionVersion: 4 });
    expect(preview.production).toContain('SELECT 1;');
    expect(preview.branch).toContain('SELECT 2;');
    calls.forEach((argv) => expect(argv.slice(0, 2)).toEqual(['--json', '--deny-writes']));
  });

  it('refuses ids that are not plain ids', async () => {
    const run = async (): Promise<RunResult> => ({ ok: true, exitCode: 0, output: {}, truncated: false });
    await expect(previewPromotion({ run, production: async () => '1', componentId: 'c --x', configId: 'k', branchId: '9' })).rejects.toThrow(/invalid/i);
  });
});
