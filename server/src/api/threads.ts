import { randomUUID } from 'node:crypto';
import { type FileIo, defaultIo, readJsonFile, writeJsonAtomic } from '../storage/json-file.ts';

/** Standing permissions the user grants per chat. */
export interface ThreadPolicy {
  /** Run kbagent_sql workspace queries without asking each time. */
  readonly allowSql: boolean;
}

export interface Thread {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly allowSql?: boolean;
}

export interface ThreadStore {
  list(): readonly Thread[];
  get(id: string): Thread | undefined;
  create(firstMessage: string): Thread;
  touch(id: string): void;
  rename(id: string, title: string): void;
  remove(id: string): void;
  policy(id: string): ThreadPolicy | undefined;
  setPolicy(id: string, policy: ThreadPolicy): void;
}

const TITLE_CHARS = 60;

export function titleFrom(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return firstLine.slice(0, TITLE_CHARS).trim() || 'New chat';
}

const read = (file: string, io: FileIo): readonly Thread[] =>
  readJsonFile<readonly Thread[]>(file, { fallback: [], io, parse: (parsed) => (Array.isArray(parsed) ? (parsed as Thread[]) : undefined) });

/** Chat thread index (titles, timestamps). Message history itself lives in the LangGraph checkpointer. */
export function createThreadStore(file: string, now: () => Date = () => new Date(), io: FileIo = defaultIo): ThreadStore {
  let threads = read(file, io);

  // Memory follows the file: when the write fails the change throws and is not taken.
  const save = (next: readonly Thread[]) => {
    writeJsonAtomic(file, next, { io });
    threads = next;
  };
  const update = (id: string, patch: Partial<Thread>) =>
    save(threads.map((thread) => (thread.id === id ? { ...thread, ...patch, updatedAt: now().toISOString() } : thread)));

  return {
    list: () => threads.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get: (id) => threads.find((thread) => thread.id === id),
    create(firstMessage) {
      const at = now().toISOString();
      const thread = { id: randomUUID(), title: titleFrom(firstMessage), createdAt: at, updatedAt: at };
      save([...threads, thread]);
      return thread;
    },
    touch: (id) => {
      if (threads.some((thread) => thread.id === id)) update(id, {});
    },
    rename: (id, title) => update(id, { title: titleFrom(title) }),
    remove: (id) => save(threads.filter((thread) => thread.id !== id)),
    policy(id) {
      const thread = threads.find((entry) => entry.id === id);
      return thread ? { allowSql: thread.allowSql === true } : undefined;
    },
    // A policy change is not chat activity, so updatedAt (and the list order) stays as is.
    setPolicy: (id, policy) => {
      if (threads.some((thread) => thread.id === id)) {
        save(threads.map((thread) => (thread.id === id ? { ...thread, allowSql: policy.allowSql } : thread)));
      }
    },
  };
}
