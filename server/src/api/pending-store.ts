import { type FileIo, defaultIo, readJsonFile, writeJsonAtomic } from '../storage/json-file.ts';
import type { PendingStore, Waiting } from './runs.ts';

const isWaiting = (value: unknown): value is Waiting =>
  typeof value === 'object' && value !== null && Array.isArray((value as Waiting).human) && Array.isArray((value as Waiting).auto);

const read = (file: string, io: FileIo): ReadonlyMap<string, Waiting> =>
  readJsonFile<ReadonlyMap<string, Waiting>>(file, {
    fallback: new Map(),
    io,
    parse: (parsed) =>
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? new Map(Object.entries(parsed).filter((entry): entry is [string, Waiting] => isWaiting(entry[1])))
        : undefined,
  });

/** Paused runs as one JSON file (threadId -> pending approvals), rewritten atomically on every change. */
export function createPendingStore(file: string, io: FileIo = defaultIo): PendingStore {
  return {
    load: () => read(file, io),
    save(waiting) {
      writeJsonAtomic(file, Object.fromEntries(waiting), { io });
    },
  };
}
