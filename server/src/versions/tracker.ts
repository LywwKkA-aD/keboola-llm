import { createHash } from 'node:crypto';
import { definitionNames, readDefinition, writeDefinition } from './files.ts';
import { createVersionLog, DEFAULT_LIMIT } from './log.ts';
import {
  type ChangeType,
  DEFINITION_KINDS,
  type DefinitionKind,
  type RestoreResult,
  type TrackedDefinition,
  type Version,
  type VersionSummary,
} from './types.ts';

export interface RecordedChange {
  readonly kind: DefinitionKind;
  readonly name: string;
  readonly change: ChangeType;
}

export interface VersionDetail extends VersionSummary {
  readonly content: string | null;
  /** The file as it is on disk now; null when it is deleted. */
  readonly current: string | null;
}

export interface DefinitionVersions {
  /** Compare every definition with its last version and record what changed: on start, then after each reload. */
  sync(reason: 'start' | 'change'): readonly RecordedChange[];
  tracked(kind: DefinitionKind): readonly TrackedDefinition[];
  /** Newest first, after recording what changed on disk since the last sync. */
  list(kind: DefinitionKind, name: string): readonly VersionSummary[];
  get(kind: DefinitionKind, name: string, id: number): VersionDetail | undefined;
  /** Write an older version back to disk (recreating a deleted definition); the file watcher reloads the team. */
  restore(kind: DefinitionKind, name: string, id: number): RestoreResult;
}

const hashOf = (content: string) => createHash('sha256').update(content).digest('hex');

const summary = ({ id, at, change, size, restoredFrom }: Version): VersionSummary => ({
  id,
  at,
  change,
  size,
  ...(restoredFrom === undefined ? {} : { restoredFrom }),
});

/**
 * Version history of agents/<name>/AGENT.md and the app's own skills/<name>/SKILL.md, kept in dir.
 * Edits are noticed by content hash, so agent-builder, a person in an editor and a git pull all count.
 */
export function createDefinitionVersions({ rootDir, dir, limit = DEFAULT_LIMIT, now = () => new Date() }: {
  rootDir: string;
  dir: string;
  limit?: number;
  now?: () => Date;
}): DefinitionVersions {
  const log = createVersionLog({ dir, limit });
  const record = (kind: DefinitionKind, name: string, change: ChangeType, content: string | undefined, extra: Partial<Version> = {}) =>
    log.append(kind, name, {
      at: now().toISOString(),
      change,
      size: content === undefined ? 0 : Buffer.byteLength(content),
      hash: content === undefined ? '' : hashOf(content),
      ...(content === undefined ? {} : { content }),
      ...extra,
    });

  /** Record the definition's state on disk if it differs from its last version. */
  const syncOne = (kind: DefinitionKind, name: string, reason: 'start' | 'change'): ChangeType | undefined => {
    const last = log.read(kind, name).at(-1);
    const content = readDefinition(rootDir, kind, name);
    const lastDeleted = !last || last.change === 'deleted';
    if (content === undefined) {
      if (lastDeleted) return undefined;
      record(kind, name, 'deleted', undefined);
      return 'deleted';
    }
    if (last && !lastDeleted && last.hash === hashOf(content)) return undefined;
    const change: ChangeType = !last ? (reason === 'start' ? 'baseline' : 'created') : lastDeleted ? 'created' : 'changed';
    record(kind, name, change, content);
    return change;
  };

  return {
    sync: (reason) =>
      DEFINITION_KINDS.flatMap((kind) => {
        const names = [...new Set([...definitionNames(rootDir, kind), ...log.names(kind)])].toSorted();
        return names.flatMap((name) => {
          const change = syncOne(kind, name, reason);
          return change ? [{ kind, name, change }] : [];
        });
      }),
    tracked: (kind) =>
      log.names(kind).flatMap((name) => {
        const last = log.read(kind, name).at(-1);
        return last ? [{ name, exists: readDefinition(rootDir, kind, name) !== undefined, last: summary(last) }] : [];
      }),
    // Reading catches up with the file first: a file watcher can miss a change (a folder removed and made again).
    list(kind, name) {
      syncOne(kind, name, 'change');
      return log.read(kind, name).map(summary).toReversed();
    },
    get(kind, name, id) {
      const version = log.read(kind, name).find((entry) => entry.id === id);
      if (!version) return undefined;
      return { ...summary(version), content: version.content ?? null, current: readDefinition(rootDir, kind, name) ?? null };
    },
    restore(kind, name, id) {
      const version = log.read(kind, name).find((entry) => entry.id === id);
      if (!version) return { ok: false, reason: 'not-found' };
      if (version.content === undefined) return { ok: false, reason: 'deleted' };
      // An edit the watcher has not synced yet stays in the history instead of being overwritten unseen.
      syncOne(kind, name, 'change');
      if (readDefinition(rootDir, kind, name) === version.content) return { ok: true, changed: false };
      writeDefinition(rootDir, kind, name, version.content);
      return { ok: true, changed: true, version: summary(record(kind, name, 'restored', version.content, { restoredFrom: id })) };
    },
  };
}
