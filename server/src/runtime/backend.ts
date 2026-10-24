import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompositeBackend, FilesystemBackend, StateBackend } from 'deepagents';
import type { SkillSource } from '../registry/types.ts';

const MEMORY_TEMPLATE = `# Shared memory

Durable facts the team has learned about the user's projects, conventions and preferences.
Keep it short and current. No secrets.
`;

const folder = (rootDir: string) => {
  mkdirSync(rootDir, { recursive: true });
  return new FilesystemBackend({ rootDir, virtualMode: true });
};

/**
 * Virtual filesystem seen by the agents:
 *   /skills/<source>/  read-only skill folders (vendored + custom)
 *   /agents/           agent definitions (agent-builder writes here)
 *   /knowledge/        shared knowledge base
 *   /memories/         shared long-term memory (data dir, not in git)
 *   /routines/         scheduled routines (agent-builder writes here)
 *   anything else      per-thread scratch space kept in the checkpoint
 */
export function createBackend({ rootDir, dataDir, skillSources }: {
  rootDir: string;
  dataDir: string;
  skillSources: readonly SkillSource[];
}): CompositeBackend {
  const memoriesDir = join(dataDir, 'memories');
  const memoryFile = join(memoriesDir, 'AGENTS.md');
  const routes = {
    ...Object.fromEntries(skillSources.map((source) => [`/skills/${source.id}/`, folder(source.dir)])),
    '/agents/': folder(join(rootDir, 'agents')),
    '/knowledge/': folder(join(rootDir, 'knowledge')),
    '/memories/': folder(memoriesDir),
    '/routines/': folder(join(rootDir, 'routines')),
  };
  if (!existsSync(memoryFile)) writeFileSync(memoryFile, MEMORY_TEMPLATE);
  return new CompositeBackend(new StateBackend(), routes);
}
