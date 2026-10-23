import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('ignores touching an unknown thread and survives a corrupt file', () => {
    const root = makeTree({ 'threads.json': '{broken' });
    const store = createThreadStore(join(root, 'threads.json'));
    store.touch('missing');
    expect(store.list()).toEqual([]);
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
