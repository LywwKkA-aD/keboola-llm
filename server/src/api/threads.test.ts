import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flakyRename } from '../test-utils/flaky-io.ts';
import { makeTree } from '../test-utils/tree.ts';
import { createThreadStore, titleFrom } from './threads.ts';

const clock = (...times: string[]) => {
  const queue = [...times];
  return () => new Date(queue.shift() ?? '2026-01-01T00:00:00Z');
};

describe('titleFrom', () => {
  it('uses the first line, collapsed and shortened', () => {
    expect(titleFrom('  Find   where\ncustomer_id is used ')).toBe('Find where');
    expect(titleFrom('x'.repeat(100))).toHaveLength(60);
    expect(titleFrom('   ')).toBe('New chat');
    expect(titleFrom(`${'a'.repeat(59)} tail`)).toBe('a'.repeat(59));
  });
});

describe('createThreadStore', () => {
  it('creates, touches and lists threads newest first, persisting to disk', () => {
    const file = join(makeTree({}), 'threads.json');
    const store = createThreadStore(file, clock('2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z'));

    const a = store.create('First question');
    const b = store.create('Second question');
    store.touch(a.id);

    expect(store.list().map((thread) => thread.title)).toEqual(['First question', 'Second question']);
    expect(store.get(b.id)?.title).toBe('Second question');
    expect(createThreadStore(file).list()).toHaveLength(2);
  });

  it('ignores touching an unknown thread and keeps a corrupt file aside instead of overwriting it', () => {
    const root = makeTree({ 'threads.json': '[{"id":"old","title":"Old ch' });
    const store = createThreadStore(join(root, 'threads.json'));
    store.touch('missing');
    expect(store.list()).toEqual([]);
    store.create('New');
    const aside = readdirSync(root).find((name) => name.startsWith('threads.json.corrupt-'));
    expect(readFileSync(join(root, aside as string), 'utf8')).toBe('[{"id":"old","title":"Old ch');
  });

  it('keeps its list as it was when a write fails (the chat is not half created)', () => {
    const file = join(makeTree({}), 'threads.json');
    const store = createThreadStore(file, clock('2026-01-01T10:00:00Z'));
    const kept = store.create('Kept');
    const failing = createThreadStore(file, clock('2026-01-01T11:00:00Z'), flakyRename(99));
    expect(() => failing.create('Lost')).toThrow(/EPERM/);
    expect(failing.list().map((thread) => thread.id)).toEqual([kept.id]);
    // A moment of antivirus is fine.
    expect(createThreadStore(file, clock(), flakyRename(2)).create('After a retry').title).toBe('After a retry');
  });

  it('stores the per-chat SQL permission without reordering threads', () => {
    const file = join(makeTree({}), 'threads.json');
    const store = createThreadStore(file, clock('2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'));
    const older = store.create('Older');
    const newer = store.create('Newer');

    expect(store.policy(older.id)).toEqual({ allowSql: false });
    store.setPolicy(older.id, { allowSql: true });

    expect(store.policy(older.id)).toEqual({ allowSql: true });
    expect(store.list().map((thread) => thread.id)).toEqual([newer.id, older.id]);
    expect(createThreadStore(file).policy(older.id)).toEqual({ allowSql: true });
    expect(store.policy('missing')).toBeUndefined();
    store.setPolicy('missing', { allowSql: true });
    expect(store.list()).toHaveLength(2);
  });

  it('renames and removes threads', () => {
    const store = createThreadStore(join(makeTree({}), 'threads.json'));
    const thread = store.create('Old');
    store.rename(thread.id, 'New title');
    expect(store.get(thread.id)?.title).toBe('New title');
    store.remove(thread.id);
    expect(store.get(thread.id)).toBeUndefined();
  });
});
