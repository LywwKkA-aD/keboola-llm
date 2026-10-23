/** Run the kbagent CLI as a child process (never through a shell) and shape its output for a model. */
import { execFile } from 'node:child_process';
import { redactSecrets } from './redact.ts';

export interface ExecOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly maxBuffer: number;
}

export interface ExecOutcome {
  /** Process exit code; null when it was killed or never started. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** Node error code when the process could not run normally, e.g. ENOENT. */
  readonly spawnError?: string;
}

export type ExecFn = (file: string, args: readonly string[], options: ExecOptions) => Promise<ExecOutcome>;

export interface RunRequest {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly maxOutputChars?: number;
  readonly command?: string;
  readonly exec?: ExecFn;
}

export interface RunResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  /** Parsed JSON when the output was JSON and fit the budget, otherwise text. */
  readonly output: unknown;
  readonly truncated: boolean;
  /** What a non-zero exit means and what to do next. */
  readonly hint?: string;
  readonly stderr?: string;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_OUTPUT_CHARS = 30_000;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const STDERR_TAIL_CHARS = 2000;

/** Exit codes documented in kbagent's gotchas reference. */
const EXIT_HINTS: Readonly<Record<number, string>> = {
  1: 'General error: read the error message.',
  2: 'Invalid arguments: check the command with ["<command>", "--help"].',
  3: 'Authentication failed or the session expired: ask the user to sign in to Keboola again.',
  4: 'Network error or timeout: retry once. For jobs, check their status before running them again.',
  5: 'Configuration error: unknown project alias, missing feature, or similar.',
  6: 'Blocked by the permission firewall: this operation is not allowed for this agent.',
  7: 'The job exceeded its timeout and was cancelled.',
};

export const defaultExec: ExecFn = (file, args, options) =>
  new Promise((resolve) => {
    const child = execFile(
      file,
      [...args],
      {
        env: options.env,
        timeout: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ exitCode: 0, stdout, stderr, timedOut: false });
          return;
        }
        const code = error.code;
        resolve({
          exitCode: typeof code === 'number' ? code : null,
          stdout,
          stderr,
          timedOut: error.killed === true && typeof code !== 'string',
          ...(typeof code === 'string' ? { spawnError: code } : {}),
        });
      },
    );
    // No interactive input: a prompt gets EOF and fails fast instead of hanging until the timeout.
    child.stdin?.end();
  });

function shapeOutput(text: string, maxChars: number): { output: unknown; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length > maxChars) {
    const note = `\n... [truncated ${trimmed.length - maxChars} more characters: narrow the query with filters or --limit]`;
    return { output: trimmed.slice(0, maxChars) + note, truncated: true };
  }
  try {
    return { output: JSON.parse(trimmed), truncated: false };
  } catch {
    return { output: trimmed, truncated: false };
  }
}

function hintFor(outcome: ExecOutcome, timeoutMs: number): string | undefined {
  if (outcome.spawnError === 'ENOENT') return 'kbagent is not installed or not on PATH. Ask the user to install it.';
  if (outcome.spawnError === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'The output was too large and was cut off. Narrow the query with filters or --limit.';
  }
  if (outcome.timedOut) {
    return `kbagent did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped. Remote jobs may still be running: check their status instead of re-running.`;
  }
  if (outcome.exitCode === 0) return undefined;
  if (outcome.exitCode === null) return `kbagent failed to run (${outcome.spawnError ?? 'unknown error'}).`;
  return EXIT_HINTS[outcome.exitCode] ?? `kbagent exited with exit code ${outcome.exitCode}.`;
}

export async function runKbagent(request: RunRequest): Promise<RunResult> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = request.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const exec = request.exec ?? defaultExec;
  const outcome = await exec(request.command ?? 'kbagent', request.argv, {
    env: request.env,
    timeoutMs,
    maxBuffer: MAX_BUFFER_BYTES,
  });

  const ok = outcome.exitCode === 0 && !outcome.timedOut && outcome.spawnError === undefined;
  const stdout = redactSecrets(outcome.stdout);
  const stderr = redactSecrets(outcome.stderr).trim();
  const source = stdout.trim() === '' && !ok ? stderr : stdout;
  const shaped = shapeOutput(source, maxOutputChars);
  const overflow = outcome.spawnError === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
  const hint = hintFor(outcome, timeoutMs);

  return {
    ok,
    exitCode: outcome.exitCode,
    output: shaped.output,
    truncated: shaped.truncated || overflow,
    ...(hint === undefined ? {} : { hint }),
    ...(!ok && stderr !== '' && source !== stderr ? { stderr: stderr.slice(-STDERR_TAIL_CHARS) } : {}),
  };
}
