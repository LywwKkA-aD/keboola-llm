import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PendingStore, Waiting } from './runs.ts';

const isWaiting = (value: unknown): value is Waiting =>
  typeof value === 'object' && value !== null && Array.isArray((value as Waiting).human) && Array.isArray((value as Waiting).auto);

function read(file: string): ReadonlyMap<string, Waiting> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter((entry): entry is [string, Waiting] => isWaiting(entry[1])));
  } catch {
    return new Map();
  }
}

/** Paused runs as one JSON file (threadId -> pending approvals), rewritten atomically on every change. */
export function createPendingStore(file: string): PendingStore {
  return {
    load: () => read(file),
    save(waiting) {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(Object.fromEntries(waiting), null, 2)}\n`);
      renameSync(temp, file);
    },
  };
}
