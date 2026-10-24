import type { FilesystemPermission } from 'deepagents';
import type { SkillInfo } from '../registry/types.ts';

/** Shared long-term memory, loaded into the lead agent's prompt on every run. */
export const MEMORY_FILE = '/memories/AGENTS.md';

/** Virtual roots that agents may read but only write when their definition allows it. */
export const PROTECTED_ROOTS = ['/skills/', '/agents/', '/knowledge/', '/memories/', '/routines/'] as const;

export const skillPath = (skill: SkillInfo): string => `/skills/${skill.sourceId}/${skill.folder}/`;

const asFolder = (prefix: string): string => (prefix.endsWith('/') ? prefix : `${prefix}/`);

/** Allow writes under the given prefixes, deny the rest of the protected roots (first match wins). */
export function permissionsFor(writes: readonly string[]): FilesystemPermission[] {
  return [
    ...writes.map((prefix): FilesystemPermission => ({ operations: ['write'], paths: [`${asFolder(prefix)}**`], mode: 'allow' })),
    { operations: ['write'], paths: PROTECTED_ROOTS.map((root) => `${root}**`), mode: 'deny' },
  ];
}
