import { describe, expect, it } from 'vitest';
import type { RunResult } from '../tools/kbagent/runner.ts';
import { accessSummary, deriveAccess, readKeboolaAccess, shortAccess } from './keboola-access.ts';

const info = (features: string[] = [], extra: Record<string, unknown> = {}) => ({
  alias: 'shop',
  project_id: 6487,
  default_backend: 'snowflake',
  auth_mode: 'session',
  features,
  is_master_token: true,
  ...extra,
});
const auth = (role: string, status = 'live') => ({ status, accessible_projects: [{ id: 6487, role }, { id: 1, role: 'admin' }] });

describe('deriveAccess', () => {
  it('lets an admin change through a branch and a promotion in the app', () => {
    expect(deriveAccess({ info: info(), auth: auth('admin') })).toMatchObject({
      project: 'shop',
      backend: 'snowflake',
      role: 'admin',
      session: 'live',
      mergeRequests: false,
      protectedProduction: false,
      changePath: 'promote',
      sql: true,
    });
    expect(deriveAccess({ info: info(), auth: auth('guest') }).changePath).toBe('promote');
  });

  it('keeps a read-only member to reading: no changes, no SQL workspaces', () => {
    expect(deriveAccess({ info: info(), auth: auth('readOnly') })).toMatchObject({ changePath: 'read-only', sql: false });
  });

  it('sends developers through merge requests, or the Keboola UI without them', () => {
    expect(deriveAccess({ info: info(['branches-merge-requests']), auth: auth('developer') })).toMatchObject({ changePath: 'merge-request', mergeRequests: true });
    expect(deriveAccess({ info: info([]), auth: auth('reviewer') }).changePath).toBe('keboola-ui');
  });

  it('leaves a protected production branch to the Keboola UI, whatever the role', () => {
    expect(deriveAccess({ info: info(['protected-default-branch', 'branches-merge-requests']), auth: auth('admin') })).toMatchObject({
      changePath: 'keboola-ui',
      protectedProduction: true,
    });
  });

  it('works with a token instead of a session, where the role is not known', () => {
    const access = deriveAccess({ info: info([], { auth_mode: 'token', is_master_token: false }) });
    expect(access).toMatchObject({ authMode: 'token', masterToken: false, changePath: 'promote' });
    expect(access.role).toBeUndefined();
    expect(access.session).toBeUndefined();
  });
});

describe('summaries', () => {
  it('tells the agents what the access allows in plain lines', () => {
    const text = accessSummary(deriveAccess({ info: info(['branches-merge-requests']), auth: auth('developer') }));
    expect(text).toContain('role developer');
    expect(text).toContain('Snowflake');
    expect(text).toMatch(/merge request/i);
    expect(accessSummary(deriveAccess({ info: info(), auth: auth('readOnly') }))).toMatch(/read-only/i);
  });

  it('fits the setup checklist in one line', () => {
    expect(shortAccess(deriveAccess({ info: info(), auth: auth('admin') }))).toBe('admin · snowflake · changes: promotion in the app');
  });
});

describe('readKeboolaAccess', () => {
  it('asks kbagent read-only for the project and, with a session, the signed-in role', async () => {
    const calls: string[] = [];
    const run = async (argv: readonly string[]): Promise<RunResult> => {
      calls.push(argv.join(' '));
      const data = argv.includes('auth') ? auth('admin') : info();
      return { ok: true, exitCode: 0, output: { status: 'ok', data }, truncated: false };
    };
    const access = await readKeboolaAccess({ run, project: 'shop' });
    expect(access.role).toBe('admin');
    expect(calls).toEqual(['--json --deny-writes project info --project shop', '--json --deny-writes auth status']);
  });

  it('fails with the command and what kbagent answered, so the setup step shows why', async () => {
    const json = async (): Promise<RunResult> => ({
      ok: false,
      exitCode: 4,
      output: { status: 'error', error: { code: 'NETWORK_ERROR', message: 'SSL: CERTIFICATE_VERIFY_FAILED' } },
      truncated: false,
    });
    await expect(readKeboolaAccess({ run: json, project: 'shop' })).rejects.toThrow(
      'kbagent could not read the project (kbagent project info --project shop, exit 4): SSL: CERTIFICATE_VERIFY_FAILED',
    );
    const text = async (): Promise<RunResult> => ({ ok: false, exitCode: 1, output: 'boom', truncated: false });
    await expect(readKeboolaAccess({ run: text })).rejects.toThrow('kbagent could not read the project (kbagent project info, exit 1): boom');
  });
});
