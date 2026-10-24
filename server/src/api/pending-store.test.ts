import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createPendingStore } from './pending-store.ts';
import type { Waiting } from './runs.ts';

const paused: Waiting = {
  human: [{ type: 'approval.required', interruptId: 'w1', requests: [{ tool: 'write_file', agent: 'agent-builder', args: { file_path: '/agents/x/AGENT.md' }, decisions: ['approve', 'reject'] }] }],
  auto: [{ interruptId: 's1', decisions: [{ type: 'approve' }] }],
};

describe('createPendingStore', () => {
  it('keeps paused runs on disk across restarts', () => {
    const file = join(makeTree({}), 'data', 'pending-approvals.json');
    createPendingStore(file).save(new Map([['t1', paused]]));

    expect(createPendingStore(file).load()).toEqual(new Map([['t1', paused]]));
  });

  it('starts empty without a file or with a damaged one', () => {
    const root = makeTree({});
    expect(createPendingStore(join(root, 'none.json')).load().size).toBe(0);

    const file = join(root, 'broken.json');
    writeFileSync(file, '{not json');
    expect(createPendingStore(file).load().size).toBe(0);
    writeFileSync(file, '{"t1": {"human": "nope"}, "t2": []}');
    expect(createPendingStore(file).load().size).toBe(0);
  });

  it('rewrites the whole file, so answered threads disappear', () => {
    const file = join(makeTree({}), 'pending-approvals.json');
    const store = createPendingStore(file);
    store.save(new Map([['t1', paused], ['t2', paused]]));
    store.save(new Map([['t2', paused]]));

    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object)).toEqual(['t2']);
  });
});
