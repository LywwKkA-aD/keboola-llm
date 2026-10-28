import { describe, expect, it } from 'vitest';
import { defaultExec, describeFailure, runKbagent } from './runner.ts';
import type { ExecFn, ExecOutcome, RunResult } from './runner.ts';

const fakeExec =
  (outcome: Partial<ExecOutcome>, calls: unknown[][] = []): ExecFn =>
  async (...args) => {
    calls.push(args);
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false, ...outcome };
  };

const run = (outcome: Partial<ExecOutcome>, extra: Partial<Parameters<typeof runKbagent>[0]> = {}) =>
  runKbagent({ argv: ['--json', 'config', 'list'], env: {}, exec: fakeExec(outcome), ...extra });

describe('runKbagent', () => {
  it('passes argv, env and limits to exec', async () => {
    const calls: unknown[][] = [];
    await runKbagent({ argv: ['--json', 'job', 'list'], env: { PATH: '/bin' }, timeoutMs: 5000, exec: fakeExec({}, calls) });
    expect(calls[0]).toEqual(['kbagent', ['--json', 'job', 'list'], expect.objectContaining({ env: { PATH: '/bin' }, timeoutMs: 5000 })]);
  });

  it('parses JSON output on success', async () => {
    const result = await run({ stdout: '{"status":"ok","data":{"configs":[]}}\n' });
    expect(result).toEqual({ ok: true, exitCode: 0, output: { status: 'ok', data: { configs: [] } }, truncated: false });
  });

  it('never returns credentials from stdout or stderr', async () => {
    const ok = await run({ stdout: '{"status":"ok","data":{"workspace_id":7,"password":"s3cret"}}' });
    expect(ok.output).toEqual({ status: 'ok', data: { workspace_id: 7, password: '[redacted]' } });

    const failed = await run({ exitCode: 1, stdout: '{"status":"error"}', stderr: 'debug {"password": "s3cret"}' });
    expect(JSON.stringify(failed)).not.toContain('s3cret');
  });

  it('returns plain text when stdout is not JSON', async () => {
    const result = await run({ stdout: 'Usage: kbagent config list\n' });
    expect(result.output).toBe('Usage: kbagent config list');
  });

  it('truncates long output and says how to narrow it', async () => {
    const big = JSON.stringify({ status: 'ok', data: 'x'.repeat(5000) });
    const result = await run({ stdout: big }, { maxOutputChars: 1000 });
    expect(result.truncated).toBe(true);
    expect(typeof result.output).toBe('string');
    expect((result.output as string).length).toBeLessThan(1300);
    expect(result.output).toMatch(/truncated/);
  });

  it('returns non-zero exits with the error envelope and a hint instead of throwing', async () => {
    const envelope = '{"status":"error","error":{"code":"CONFIG_ERROR","message":"no alias"}}';
    const result = await run({ exitCode: 5, stdout: envelope, stderr: 'warning\n' });
    expect(result).toMatchObject({ ok: false, exitCode: 5, output: { status: 'error' } });
    expect(result.hint).toMatch(/configuration/i);
    expect(result.stderr).toBe('warning');
  });

  it('falls back to stderr when stdout is empty', async () => {
    const result = await run({ exitCode: 2, stderr: 'No such option: --nope' });
    expect(result.output).toBe('No such option: --nope');
    expect(result.hint).toMatch(/--help/);
  });

  it('keeps only the tail of a long stderr', async () => {
    const result = await run({ exitCode: 1, stdout: '{}', stderr: `${'a'.repeat(5000)}END` });
    expect(result.stderr?.endsWith('END')).toBe(true);
    expect(result.stderr?.length).toBeLessThanOrEqual(2001);
  });

  it('explains firewall blocks', async () => {
    expect((await run({ exitCode: 6, stdout: '{}' })).hint).toMatch(/blocked/i);
  });

  it('reports timeouts as retryable without claiming failure of remote jobs', async () => {
    const result = await run({ exitCode: null, timedOut: true }, { timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.hint).toMatch(/did not finish within 1 s/);
  });

  it('reports a missing kbagent binary', async () => {
    const result = await run({ exitCode: null, spawnError: 'ENOENT' });
    expect(result.hint).toMatch(/not installed/);
  });

  it('reports output that exceeded the buffer as truncated', async () => {
    const result = await run({ exitCode: null, stdout: 'partial', spawnError: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
    expect(result).toMatchObject({ ok: false, truncated: true });
    expect(result.hint).toMatch(/too large/);
  });

  it('gives a generic hint for unknown exit codes', async () => {
    expect((await run({ exitCode: 42, stdout: '{}' })).hint).toMatch(/exit code 42/);
  });
});

describe('defaultExec', () => {
  const node = process.execPath;
  const options = { env: process.env, timeoutMs: 10_000, maxBuffer: 1024 * 1024 };

  it('captures stdout, stderr and the exit code without a shell', async () => {
    const outcome = await defaultExec(node, ['-e', 'console.log("out $HOME"); console.error("err"); process.exit(3)'], options);
    expect(outcome).toMatchObject({ exitCode: 3, stdout: 'out $HOME\n', stderr: 'err\n', timedOut: false });
  });

  it('closes stdin so interactive prompts fail fast instead of hanging', async () => {
    const outcome = await defaultExec(node, ['-e', 'process.stdin.resume(); process.stdin.on("end", () => console.log("eof"))'], options);
    expect(outcome.stdout).toBe('eof\n');
  });

  it('stops processes that exceed the timeout', async () => {
    const outcome = await defaultExec(node, ['-e', 'setTimeout(() => {}, 10000)'], { ...options, timeoutMs: 200 });
    expect(outcome.timedOut).toBe(true);
  });

  it('reports spawn errors such as a missing binary', async () => {
    const outcome = await defaultExec('definitely-not-kbagent-binary', [], options);
    expect(outcome).toMatchObject({ exitCode: null, spawnError: 'ENOENT' });
  });
});

describe('describeFailure', () => {
  const failed = (output: unknown, stderr?: string): RunResult => ({ ok: false, exitCode: 2, output, truncated: false, ...(stderr ? { stderr } : {}) });

  it('takes the error out of the framed panel kbagent prints for a usage error', () => {
    const panel = [
      'Usage: kbagent project info [OPTIONS]',
      "Try 'kbagent project info --help' for help.",
      '╭─ Error ──────────────────────────────────╮',
      "│ Missing option '--project'.              │",
      '╰──────────────────────────────────────────╯',
    ].join('\n');
    expect(describeFailure(failed('', panel))).toBe("Missing option '--project'.");
    expect(describeFailure(failed('', panel.replace(/[╭╰]/g, '└').replace(/[╮╯]/g, '┘')))).toBe("Missing option '--project'.");
  });

  it('prefers kbagent\'s JSON error, then the last plain line', () => {
    expect(describeFailure(failed({ status: 'error', error: { message: 'no config' } }))).toBe('no config');
    expect(describeFailure(failed('first\nlast line'))).toBe('last line');
    expect(describeFailure({ ok: false, exitCode: null, output: '', truncated: false, hint: 'kbagent is not installed' })).toBe('kbagent is not installed');
  });
});
