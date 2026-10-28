// The runner and env only, not the agent tools: `npm run doctor` loads this file without LangChain.
import { buildChildEnv } from '../tools/kbagent/env.ts';
import { type ExecFn, type RunResult, runKbagent } from '../tools/kbagent/runner.ts';
import { type KeboolaAccess, readKeboolaAccess } from './keboola-access.ts';

export interface KeboolaProject {
  readonly alias: string;
  readonly name: string;
  readonly id: number | null;
  readonly stackUrl: string;
  readonly isDefault: boolean;
}

/** Generous: on an office Windows machine an antivirus can slow Python's start down a lot. */
const TIMEOUT_MS = 45_000;

interface Options {
  readonly exec?: ExecFn;
  readonly env?: NodeJS.ProcessEnv;
}

const run = (argv: readonly string[], { exec, env = process.env }: Options) =>
  runKbagent({ argv, env: buildChildEnv({ parentEnv: env }), timeoutMs: TIMEOUT_MS, ...(exec ? { exec } : {}) });

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** What kbagent said when a call failed: its JSON error, else the last line of its stderr, else the runner's hint. */
function failureOf(result: RunResult): string {
  const error = (result.output as { error?: { message?: unknown } } | undefined)?.error?.message;
  if (typeof error === 'string' && error) return error;
  const text = [typeof result.output === 'string' ? result.output : '', result.stderr ?? ''].join('\n');
  const last = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  return (last ?? result.hint ?? 'no output').slice(0, 300);
}

/** Projects registered in kbagent, as aliases the user can pick. Tokens are never returned. */
export async function listKeboolaProjects(options: Options = {}): Promise<KeboolaProject[]> {
  const result = await run(['--json', 'project', 'list'], options);
  const data = (result.output as { data?: unknown } | undefined)?.data;
  if (!result.ok || !Array.isArray(data)) throw new Error(`kbagent project list failed (exit ${String(result.exitCode)}): ${failureOf(result)}`);
  return data
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      alias: str(entry.alias),
      name: str(entry.project_name),
      id: typeof entry.project_id === 'number' ? entry.project_id : null,
      stackUrl: str(entry.stack_url),
      isDefault: entry.is_default === true,
    }))
    .filter((project) => project.alias);
}

/** `kbagent --version`, e.g. "kbagent v0.100.2". */
export async function kbagentVersion(options: Options = {}): Promise<string> {
  const result = await run(['--version'], options);
  // No exit code: the process never ran (or was killed), almost always because kbagent is not installed.
  if (!result.ok) throw new Error(result.exitCode === null ? 'not installed or not on PATH' : `kbagent --version failed (exit ${result.exitCode})`);
  return String(result.output).trim();
}

/** What the analyst may do in the project (role, features, how changes reach production); read-only calls. */
export function keboolaAccess(project: string | undefined, options: Options = {}): Promise<KeboolaAccess> {
  return readKeboolaAccess({ run: (argv) => run(argv, options), ...(project ? { project } : {}) });
}
