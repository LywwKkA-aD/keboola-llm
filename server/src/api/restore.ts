import type { RunManager } from './runs.ts';

/** The slice of a compiled graph needed to see which interrupts a thread still waits on. */
export interface InterruptReader {
  getState(config: { configurable: { thread_id: string } }): Promise<{ tasks: readonly { interrupts: readonly { id?: string; value?: unknown }[] }[] }>;
}

/** The slice of a compiled graph needed to see whether a thread has work left: the nodes due next. */
export interface ProgressReader {
  getState(config: { configurable: { thread_id: string } }): Promise<{ next: readonly string[]; tasks: readonly { interrupts: readonly unknown[] }[] }>;
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
  runs: Pick<RunManager, 'waitingThreads' | 'pending' | 'discard' | 'forgetApprovals'>;
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
  // A deleted chat goes entirely; an existing one only loses the approvals, its run may still be continued.
  dropped.forEach((threadId) => (exists(threadId) ? runs.forgetApprovals(threadId) : runs.discard(threadId)));
  return dropped;
}

/**
 * Whether a thread's run stopped midway: the checkpoint still has nodes to run. A failed or stopped run looks the
 * same, and so does one a server restart cut off. Interrupts in the checkpoint do not tell a waiting run apart: an
 * answered one stays there until the subagent's whole step ends. The run manager keeps waiting threads (restored
 * approvals) out of the resumable ones, and continuing re-raises an interrupt that is really still open.
 */
export async function hasUnfinishedRun(graph: ProgressReader, threadId: string): Promise<boolean> {
  const state = await graph.getState({ configurable: { thread_id: threadId } });
  return state.next.length > 0;
}

/** On start: the chats whose run a restart (or an earlier failure) left unfinished; unreadable ones are skipped. */
export async function findUnfinishedRuns({ threadIds, isUnfinished }: {
  threadIds: readonly string[];
  isUnfinished: (threadId: string) => Promise<boolean>;
}): Promise<readonly string[]> {
  const unfinished = await Promise.all(threadIds.map((threadId) => isUnfinished(threadId).catch(() => false)));
  return threadIds.filter((_, index) => unfinished[index]);
}
