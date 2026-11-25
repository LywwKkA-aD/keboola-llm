import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompositeBackend, FilesystemBackend, StateBackend } from 'deepagents';
import { windowsNameProblem } from '../knowledge/note-path.ts';
import { seedKnowledge } from '../knowledge/seed.ts';
import type { SkillSource } from '../registry/types.ts';

const MEMORY_TEMPLATE = `# Shared memory

Durable facts the team has learned about the user's projects, conventions and preferences.
Keep it short and current. No secrets.
`;

/** Why an agent may not write `path` (a name Windows would mangle), or undefined. */
export function unsafeWritePath(path: string): string | undefined {
  for (const segment of path.split(/[\\/]/).filter((part) => part !== '' && part !== '.')) {
    const problem = windowsNameProblem(segment);
    if (problem) return `Error: cannot write ${path}: ${problem}. Use letters, digits, "-", "_" and "." inside names.`;
  }
  return undefined;
}

/** A folder of real files for the agents; names that Windows would mangle are refused, on every system alike. */
class FolderBackend extends FilesystemBackend {
  override async write(filePath: string, content: string) {
    const error = unsafeWritePath(filePath);
    return error ? { error } : super.write(filePath, content);
  }

  override async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean) {
    const error = unsafeWritePath(filePath);
    return error ? { error } : super.edit(filePath, oldString, newString, replaceAll);
  }

  override async uploadFiles(files: Array<[string, Uint8Array]>) {
    const safe = files.filter(([path]) => !unsafeWritePath(path));
    const done = safe.length > 0 ? await super.uploadFiles(safe) : [];
    return files.map(([path]) => done.find((entry) => entry.path === path) ?? { path, error: 'invalid_path' as const });
  }
}

const folder = (rootDir: string) => {
  mkdirSync(rootDir, { recursive: true });
  return new FolderBackend({ rootDir, virtualMode: true });
};

/**
 * Virtual filesystem seen by the agents:
 *   /skills/<source>/  read-only skill folders (vendored + custom)
 *   /agents/           agent definitions (agent-builder writes here)
 *   /knowledge/        shared knowledge base (data dir, not in git: it holds company notes)
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
  const knowledgeDir = join(dataDir, 'knowledge');
  seedKnowledge(knowledgeDir, join(rootDir, 'knowledge'));
  const routes = {
    ...Object.fromEntries(skillSources.map((source) => [`/skills/${source.id}/`, folder(source.dir)])),
    '/agents/': folder(join(rootDir, 'agents')),
    '/knowledge/': folder(knowledgeDir),
    '/memories/': folder(memoriesDir),
    '/routines/': folder(join(rootDir, 'routines')),
  };
  if (!existsSync(memoryFile)) writeFileSync(memoryFile, MEMORY_TEMPLATE);
  return new CompositeBackend(new StateBackend(), routes);
}
