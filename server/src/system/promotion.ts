import type { RunResult } from '../tools/kbagent/runner.ts';

/** What the user sees before promoting a branch configuration to production (kbagent_promote). */
export interface PromotionPreview {
  readonly productionVersion?: number;
  readonly production: string;
  readonly branch: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BRANCH = /^\d{1,20}$/;

interface Block {
  readonly name?: unknown;
  readonly codes?: readonly { readonly name?: unknown; readonly script?: unknown }[];
}

/** A configuration as text worth diffing: SQL statements of transformations, pretty JSON otherwise. */
export function readableConfig(configuration: unknown): string {
  const record = (configuration ?? {}) as { parameters?: { blocks?: unknown }; storage?: unknown };
  const blocks = record.parameters?.blocks;
  if (!Array.isArray(blocks)) return JSON.stringify(configuration ?? {}, null, 2);
  const code = (blocks as Block[]).flatMap((block) => [
    `-- Block: ${String(block.name ?? '')}`,
    ...(block.codes ?? []).flatMap((entry) => [
      `-- Code: ${String(entry.name ?? '')}`,
      ...(Array.isArray(entry.script) ? entry.script.map(String) : [String(entry.script ?? '')]),
    ]),
  ]);
  return [...code, '', '-- Storage mappings', JSON.stringify(record.storage ?? {}, null, 2)].join('\n');
}

const dataOf = (result: RunResult) => (result.ok ? (result.output as { data?: { version?: unknown; configuration?: unknown } } | undefined)?.data : undefined);

/** Production and branch versions of one configuration, read-only. */
export async function previewPromotion({ run, production, project, componentId, configId, branchId }: {
  run: (argv: readonly string[]) => Promise<RunResult>;
  production: () => Promise<string | undefined>;
  project?: string;
  componentId: string;
  configId: string;
  branchId: string;
}): Promise<PromotionPreview> {
  if (!ID.test(componentId) || !ID.test(configId) || !BRANCH.test(branchId)) throw new Error('Invalid configuration or branch id');
  const prod = await production();
  if (!prod) throw new Error('The production branch of this project is not known');
  const read = (branch: string) =>
    run(['--json', '--deny-writes', 'config', 'detail', '--component-id', componentId, '--config-id', configId, '--branch', branch, ...(project ? ['--project', project] : [])]);
  const [current, proposed] = await Promise.all([read(prod), read(branchId)]).then((results) => results.map(dataOf));
  if (!current || !proposed) throw new Error('The configuration could not be read');
  return {
    ...(typeof current.version === 'number' ? { productionVersion: current.version } : {}),
    production: readableConfig(current.configuration),
    branch: readableConfig(proposed.configuration),
  };
}
