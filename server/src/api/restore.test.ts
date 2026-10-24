import { describe, expect, it } from 'vitest';
import { dropStaleApprovals, pendingInterruptIds } from './restore.ts';

const approval = (interruptId: string) => ({ type: 'approval.required' as const, interruptId, requests: [] });

function fakeRuns(pending: Record<string, string[]>) {
  const discarded: string[] = [];
  return {
    discarded,
    waitingThreads: () => Object.keys(pending),
    pending: (threadId: string) => (pending[threadId] ?? []).map(approval),
    discard: (threadId: string) => {
      discarded.push(threadId);
    },
  };
}

describe('pendingInterruptIds', () => {
  it('collects interrupt ids from every task of the saved graph state, nested subagents included', async () => {
    const graph = {
      getState: async () => ({ tasks: [{ interrupts: [{ id: 'a' }, { id: 'b' }] }, { interrupts: [] }, { interrupts: [{ value: 'no id' }] }] }),
    };
    expect(await pendingInterruptIds(graph, 't1')).toEqual(new Set(['a', 'b']));
  });
});

describe('dropStaleApprovals', () => {
  it('keeps restored approvals the checkpointer still waits on and drops the rest', async () => {
    const runs = fakeRuns({ live: ['a'], answered: ['b'], deleted: ['c'], broken: ['d'] });
    const saved: Record<string, string[]> = { live: ['a', 'x'], answered: [], broken: [] };
    const dropped = await dropStaleApprovals({
      runs,
      exists: (threadId) => threadId !== 'deleted',
      interruptIds: async (threadId) => {
        if (threadId === 'broken') throw new Error('database is locked');
        return new Set(saved[threadId]);
      },
    });

    expect(runs.discarded).toEqual(['answered', 'deleted', 'broken']);
    expect(dropped).toEqual(['answered', 'deleted', 'broken']);
  });
});
