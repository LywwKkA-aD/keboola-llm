import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../storage/json-file.ts';
import { NAME_RE } from '../registry/types.ts';
import { assertName } from './files.ts';
import type { ChangeType, DefinitionKind, Version } from './types.ts';

export const DEFAULT_LIMIT = 50;

const CHANGES: readonly string[] = ['baseline', 'created', 'changed', 'deleted', 'restored'] satisfies ChangeType[];

export interface VersionLog {
  /** Versions of one definition, oldest first; empty when it has no history. */
  read(kind: DefinitionKind, name: string): readonly Version[];
  /** Add a version with the next id and drop the oldest beyond the limit. */
  append(kind: DefinitionKind, name: string, entry: Omit<Version, 'id'>): Version;
  /** Names of the definitions that have a history. */
  names(kind: DefinitionKind): readonly string[];
}

const isVersion = (value: unknown): value is Version => {
  const version = value as Version;
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger(version.id) &&
    typeof version.at === 'string' &&
    CHANGES.includes(version.change) &&
    typeof version.size === 'number' &&
    typeof version.hash === 'string' &&
    (version.content === undefined || typeof version.content === 'string')
  );
};

// A damaged history file is kept aside (<name>.json.corrupt-<time>), not overwritten by the next version.
const readFile = (file: string): readonly Version[] =>
  readJsonFile<readonly Version[]>(file, {
    fallback: [],
    parse: (parsed) => {
      const versions = (parsed as { versions?: unknown } | null)?.versions;
      return Array.isArray(versions) ? versions.filter(isVersion) : undefined;
    },
  });

/** One JSON file per definition under dir/<kind>/<name>.json, rewritten atomically on every change. */
export function createVersionLog({ dir, limit = DEFAULT_LIMIT }: { dir: string; limit?: number }): VersionLog {
  const fileOf = (kind: DefinitionKind, name: string) => {
    assertName(name);
    return join(dir, kind, `${name}.json`);
  };

  return {
    read: (kind, name) => readFile(fileOf(kind, name)),
    append(kind, name, entry) {
      const file = fileOf(kind, name);
      const versions = readFile(file);
      const version: Version = { id: (versions.at(-1)?.id ?? 0) + 1, ...entry };
      writeJsonAtomic(file, { versions: [...versions, version].slice(-limit) });
      return version;
    },
    names(kind) {
      const folder = join(dir, kind);
      if (!existsSync(folder)) return [];
      return readdirSync(folder)
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.slice(0, -'.json'.length))
        .filter((name) => NAME_RE.test(name))
        .toSorted();
    },
  };
}
