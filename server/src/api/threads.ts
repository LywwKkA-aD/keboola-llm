import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Thread {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ThreadStore {
  list(): readonly Thread[];
  get(id: string): Thread | undefined;
  create(firstMessage: string): Thread;
  touch(id: string): void;
  rename(id: string, title: string): void;
  remove(id: string): void;
}

const TITLE_CHARS = 60;

export function titleFrom(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return firstLine.slice(0, TITLE_CHARS) || 'New chat';
}

function read(file: string): readonly Thread[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? (parsed as Thread[]) : [];
  } catch {
    return [];
  }
}

/** Chat thread index (titles, timestamps). Message history itself lives in the LangGraph checkpointer. */
export function createThreadStore(file: string, now: () => Date = () => new Date()): ThreadStore {
  let threads = read(file);

  const save = (next: readonly Thread[]) => {
    threads = next;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(threads, null, 2)}\n`);
    renameSync(temp, file);
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
  };
}
