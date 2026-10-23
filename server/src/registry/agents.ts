import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { parseFrontmatter } from './frontmatter.ts';
import { type AgentDefinition, agentFrontmatterSchema, type LoadError, type LoadResult } from './types.ts';

type FileResult = { readonly agent: AgentDefinition } | { readonly error: LoadError };

const EXTENDS_ROOTS = ['vendor', 'agents'];

/** Load every agents/<name>/AGENT.md under rootDir. Bad files are reported, never fatal. */
export function loadAgents(rootDir: string): LoadResult<AgentDefinition> {
  const agentsDir = join(rootDir, 'agents');
  if (!existsSync(agentsDir)) return { items: [], errors: [{ file: agentsDir, message: 'agents folder not found' }] };

  const results = readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(agentsDir, entry.name, 'AGENT.md'))
    .filter((file) => existsSync(file))
    .map((file) => loadAgentFile(rootDir, file));

  const items = results
    .flatMap((result) => ('agent' in result ? [result.agent] : []))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const errors = results.flatMap((result) => ('error' in result ? [result.error] : []));

  return { items, errors: [...errors, ...checkTeam(agentsDir, items)] };
}

function loadAgentFile(rootDir: string, file: string): FileResult {
  const fail = (message: string): FileResult => ({ error: { file, message } });
  try {
    const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'));
    const parsed = agentFrontmatterSchema.safeParse(data);
    if (!parsed.success) return fail(z.prettifyError(parsed.error));

    const definition = parsed.data;
    const folder = basename(dirname(file));
    if (definition.name !== folder) return fail(`name "${definition.name}" must match its folder "${folder}"`);

    const upstream = definition.extends ? readUpstream(rootDir, definition.extends) : undefined;
    if (upstream && 'error' in upstream) return fail(upstream.error);

    return {
      agent: {
        ...definition,
        prompt: composePrompt(upstream?.body, body),
        file,
        ...(definition.extends ? { basedOn: definition.extends } : {}),
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function readUpstream(rootDir: string, rel: string): { readonly body: string } | { readonly error: string } {
  const target = resolve(rootDir, rel);
  const inside = EXTENDS_ROOTS.some((root) => target.startsWith(resolve(rootDir, root) + sep));
  if (!inside || !target.endsWith('.md')) return { error: `extends must point to a .md file under ${EXTENDS_ROOTS.join('/ or ')}/` };
  if (!existsSync(target)) return { error: `extends target not found: ${relative(rootDir, target)}` };
  return { body: parseFrontmatter(readFileSync(target, 'utf8')).body };
}

function composePrompt(upstream: string | undefined, own: string): string {
  if (!upstream) return own;
  return own ? `${upstream}\n\n## Adaptation for this app\n\n${own}` : upstream;
}

function checkTeam(agentsDir: string, agents: readonly AgentDefinition[]): LoadError[] {
  const leads = agents.filter((agent) => agent.enabled && agent.role === 'orchestrator').length;
  return leads === 1 || agents.length === 0
    ? []
    : [{ file: agentsDir, message: `Exactly one enabled orchestrator is required, found ${leads}` }];
}
