/**
 * kbagent_promote: the one way a change reaches production from the app. It runs only after the user approved it
 * (the UI shows production against the branch), and it builds every kbagent call itself: the agent names a
 * configuration and the branch it was changed on, never the content that gets written.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { RunResult } from './runner.ts';
import { type KbagentToolsOptions, productionBranchOf, projectArgs, runnerFor } from './tools.ts';

export const PROMOTE_TOOL = 'kbagent_promote';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** Longer configurations go through a temporary file: Windows limits a command line to about 32 000 characters. */
const INLINE_LIMIT = 8000;

const schema = z.object({
  component_id: z.string().regex(ID).describe('Component id, e.g. keboola.snowflake-transformation'),
  config_id: z.string().regex(ID).describe('Configuration id'),
  branch_id: z.string().regex(/^\d{1,20}$/).describe('The development branch the change was made and verified on'),
  production_version: z.number().int().nonnegative().describe('"version" from your first read of the production configuration'),
  summary: z.string().min(3).max(300).describe('One line for the configuration history: what changed and why'),
});

type Input = z.infer<typeof schema>;

const DESCRIPTION = `Carry a configuration you changed and verified on a development branch over to production. The user approves it in the app after seeing production next to the branch; only then this runs. The app copies the branch's configuration itself (you never send configuration content) and refuses when production changed since you read it: pass the "version" from your first production read (["config", "detail", ...] without --branch). One call per changed configuration. Configuration rows are not promoted here: if they changed, ask the user to merge in Keboola.`;

interface ConfigDetail {
  readonly version?: unknown;
  readonly configuration?: unknown;
  readonly rows?: unknown;
}

const dataOf = (result: RunResult): ConfigDetail | undefined => (result.ok ? (result.output as { data?: ConfigDetail } | undefined)?.data : undefined);

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).toSorted().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/** JSON that ignores key order, to compare two configurations. */
const canonical = (value: unknown) => JSON.stringify(sortKeys(value ?? null));

export function createKbagentPromoteTool(options: Omit<KbagentToolsOptions, 'access'>) {
  const scoped: KbagentToolsOptions = { ...options, access: 'write' };
  const run = runnerFor(scoped);
  const production = productionBranchOf(run, scoped);
  const detail = (input: Input, branch: string) =>
    run(['--json', '--deny-writes', 'config', 'detail', '--component-id', input.component_id, '--config-id', input.config_id, '--branch', branch, ...projectArgs(scoped)]);

  async function write(input: Input, configuration: unknown, prod: string): Promise<RunResult> {
    const json = JSON.stringify(configuration);
    const folder = json.length > INLINE_LIMIT ? mkdtempSync(join(tmpdir(), 'agent-studio-promote-')) : undefined;
    try {
      const value = folder ? `@${join(folder, 'configuration.json')}` : json;
      if (folder) writeFileSync(join(folder, 'configuration.json'), json);
      return await run([
        '--json',
        '--deny-destructive',
        'config',
        'update',
        '--component-id',
        input.component_id,
        '--config-id',
        input.config_id,
        '--configuration',
        value,
        '--change-description',
        `Promoted from development branch ${input.branch_id} via Agent Studio: ${input.summary}`,
        '--branch',
        prod,
        ...projectArgs(scoped),
      ]);
    } finally {
      if (folder) rmSync(folder, { recursive: true, force: true });
    }
  }

  return tool(
    async (input: Input): Promise<string> => {
      const prod = await production();
      if (!prod) return 'Not promoted: the production branch of this project is not known. Try again; if it keeps failing, ask the user to check kbagent.';
      if (input.branch_id === '0' || input.branch_id === prod) {
        return 'Not promoted: branch_id must be the development branch the change was made on, not production.';
      }
      const current = dataOf(await detail(input, prod));
      if (!current) return 'Not promoted: the production configuration could not be read.';
      if (current.version !== input.production_version) {
        return `Not promoted: production changed since you read it (version ${input.production_version}, now ${String(current.version)}). Read it again, see what changed, and redo the change on the branch if needed.`;
      }
      const branch = dataOf(await detail(input, input.branch_id));
      if (!branch) return 'Not promoted: the configuration on the development branch could not be read.';
      if (canonical(current.rows ?? []) !== canonical(branch.rows ?? [])) {
        return 'Not promoted: the configuration rows differ between production and the branch; ask the user to merge this one in Keboola.';
      }
      if (canonical(current.configuration) === canonical(branch.configuration)) return 'Nothing to promote: production already has this configuration.';

      const update = await write(input, branch.configuration, prod);
      if (!update.ok) {
        return `Promotion failed (kbagent exit ${String(update.exitCode)}${update.hint ? `: ${update.hint}` : ''}). Read production before trying again.`;
      }
      const after = dataOf(await detail(input, prod));
      return after && canonical(after.configuration) === canonical(branch.configuration)
        ? `Promoted to production: ${input.component_id} ${input.config_id} is now version ${String(after.version)}, with the configuration from branch ${input.branch_id}.`
        : 'The promotion was written, but production does not match the branch when read back; read it and tell the user.';
    },
    { name: PROMOTE_TOOL, description: DESCRIPTION, schema },
  );
}
