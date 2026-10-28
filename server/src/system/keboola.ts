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

type Entry = Record<string, unknown>;
const isEntry = (value: unknown): value is Entry => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The project entries of `project list`: a list (current kbagent), or a list or alias map under `projects`, or an alias
 * map (other versions); the alias comes from the key where the entry has none.
 */
function projectEntries(data: unknown): Entry[] | undefined {
  const fromMap = (map: Entry) => Object.entries(map).flatMap(([alias, entry]) => (isEntry(entry) ? [{ alias, ...entry }] : []));
  if (Array.isArray(data)) return data.filter(isEntry);
  if (!isEntry(data)) return undefined;
  if (Array.isArray(data.projects)) return data.projects.filter(isEntry);
  if (isEntry(data.projects)) return fromMap(data.projects);
  return fromMap(data);
}

/** Projects registered in kbagent, as aliases the user can pick. Tokens are never returned. */
export async function listKeboolaProjects(options: Options = {}): Promise<KeboolaProject[]> {
  const result = await run(['--json', 'project', 'list'], options);
  const entries = result.ok ? projectEntries((result.output as { data?: unknown } | undefined)?.data) : undefined;
  if (!entries) throw new Error(`kbagent project list failed (exit ${String(result.exitCode)}): ${failureOf(result)}`);
  return entries
    .map((entry) => ({
      alias: str(entry.alias),
      name: str(entry.project_name),
      id: typeof entry.project_id === 'number' ? entry.project_id : null,
      stackUrl: str(entry.stack_url),
      isDefault: entry.is_default === true,
    }))
    .filter((project) => project.alias);
}

/**
 * Where kbagent run by the app reads its projects: the "Config source" line of `kbagent doctor`, e.g. "Using global
 * config at C:\\...\\config.json". Asked only when the app finds no projects, to compare with the analyst's terminal.
 */
export async function kbagentConfigSource(options: Options = {}): Promise<string | undefined> {
  const result = await run(['--json', 'doctor'], options);
  const checks = (result.output as { data?: { checks?: unknown } } | undefined)?.data?.checks;
  const source = Array.isArray(checks) ? checks.filter(isEntry).find((check) => check.check === 'config_source') : undefined;
  return str(source?.message) || undefined;
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
