import type { RunManager } from './runs.ts';

/** The slice of a compiled graph needed to see which interrupts a thread still waits on. */
export interface InterruptReader {
  getState(config: { configurable: { thread_id: string } }): Promise<{ tasks: readonly { interrupts: readonly { id?: string; value?: unknown }[] }[] }>;
}

/** Ids of the interrupts the checkpointer holds for a thread; a subagent's interrupts show on the lead's task. */
export async function pendingInterruptIds(graph: InterruptReader, threadId: string): Promise<ReadonlySet<string>> {
  const state = await graph.getState({ configurable: { thread_id: threadId } });
  return new Set(state.tasks.flatMap((task) => task.interrupts.flatMap((entry) => (entry.id ? [entry.id] : []))));
}

/**
 * After a restart, forget restored approvals that can no longer be answered: the chat is gone, or the
 * checkpointer does not hold their interrupts any more (or cannot be read). Returns the dropped threads.
 */
export async function dropStaleApprovals({ runs, exists, interruptIds }: {
  runs: Pick<RunManager, 'waitingThreads' | 'pending' | 'discard'>;
  exists: (threadId: string) => boolean;
  interruptIds: (threadId: string) => Promise<ReadonlySet<string>>;
}): Promise<readonly string[]> {
  const isStale = async (threadId: string) => {
    if (!exists(threadId)) return true;
    try {
      const ids = await interruptIds(threadId);
      return !runs.pending(threadId).every((approval) => ids.has(approval.interruptId));
    } catch {
      return true;
    }
  };
  const threads = runs.waitingThreads();
  const stale = await Promise.all(threads.map(isStale));
  const dropped = threads.filter((_, index) => stale[index]);
  dropped.forEach((threadId) => runs.discard(threadId));
  return dropped;
}
