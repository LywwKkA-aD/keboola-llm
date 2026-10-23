import { buildChildEnv, type ExecFn, runKbagent } from '../tools/kbagent/index.ts';

export interface KeboolaProject {
  readonly alias: string;
  readonly name: string;
  readonly id: number | null;
  readonly stackUrl: string;
  readonly isDefault: boolean;
}

const TIMEOUT_MS = 20_000;

interface Options {
  readonly exec?: ExecFn;
  readonly env?: NodeJS.ProcessEnv;
}

const run = (argv: readonly string[], { exec, env = process.env }: Options) =>
  runKbagent({ argv, env: buildChildEnv({ parentEnv: env }), timeoutMs: TIMEOUT_MS, ...(exec ? { exec } : {}) });

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** Projects registered in kbagent, as aliases the user can pick. Tokens are never returned. */
export async function listKeboolaProjects(options: Options = {}): Promise<KeboolaProject[]> {
  const result = await run(['--json', 'project', 'list'], options);
  const data = (result.output as { data?: unknown } | undefined)?.data;
  if (!result.ok || !Array.isArray(data)) throw new Error(`kbagent project list failed (exit ${result.exitCode})`);
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
  if (!result.ok) throw new Error(`kbagent --version failed (exit ${result.exitCode})`);
  return String(result.output).trim();
}
