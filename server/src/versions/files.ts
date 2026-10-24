import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NAME_RE } from '../registry/types.ts';
import type { DefinitionKind } from './types.ts';

const FILE_NAME: Record<DefinitionKind, string> = { agents: 'AGENT.md', skills: 'SKILL.md' };

/** Throw unless the name is a valid definition name, so it can never leave its folder. */
export function assertName(name: string): void {
  if (!NAME_RE.test(name)) throw new Error(`Invalid definition name: ${JSON.stringify(name)}`);
}

/** <root>/agents/<name>/AGENT.md or <root>/skills/<name>/SKILL.md, built only from a checked kind and name. */
export function definitionFile(rootDir: string, kind: DefinitionKind, name: string): string {
  assertName(name);
  return join(rootDir, kind, name, FILE_NAME[kind]);
}

/** Names of the definitions on disk: folders with a valid name that hold the definition file. */
export function definitionNames(rootDir: string, kind: DefinitionKind): string[] {
  const dir = join(rootDir, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && NAME_RE.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => existsSync(definitionFile(rootDir, kind, name)))
    .toSorted();
}

export function readDefinition(rootDir: string, kind: DefinitionKind, name: string): string | undefined {
  try {
    return readFileSync(definitionFile(rootDir, kind, name), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Replace the file in one step (temp file + rename), creating its folder if it was deleted. */
export function writeDefinition(rootDir: string, kind: DefinitionKind, name: string, content: string): void {
  const file = definitionFile(rootDir, kind, name);
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content);
  renameSync(temp, file);
}
