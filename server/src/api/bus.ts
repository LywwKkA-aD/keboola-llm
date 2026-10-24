import type { ApprovalRequest, TeamEvent } from '../runtime/events.ts';
import type { FailureReason } from './failure.ts';

/** Run lifecycle events published next to the agent events. */
export type RunEvent =
  // resume: the run continues the previous turn (an approval answer, or Continue after a failure)
  // instead of answering a new message.
  | { readonly type: 'run.started'; readonly runId: string; readonly resume?: true }
  | { readonly type: 'run.waiting'; readonly runId: string }
  | { readonly type: 'run.finished'; readonly runId: string }
  | { readonly type: 'run.failed'; readonly runId: string; readonly reason: FailureReason; readonly error: string }
  // An approval the app granted on the user's standing permission (e.g. SQL allowed for the chat).
  | { readonly type: 'approval.auto'; readonly interruptId: string; readonly requests: readonly ApprovalRequest[] };
/** App-wide news, published on SYSTEM_THREAD. */
export type SystemEvent = { readonly type: 'team.updated' };

export type BusEvent = TeamEvent | RunEvent | SystemEvent;

/** Thread id for events that belong to no chat. */
export const SYSTEM_THREAD = '_system';

export interface Envelope {
  readonly seq: number;
  /** Publish time (epoch ms), so replayed events keep their real timing. */
  readonly at: number;
  readonly threadId: string;
  readonly event: BusEvent;
}

type Listener = (envelope: Envelope) => void;

export interface EventBus {
  publish(threadId: string, event: BusEvent): Envelope;
  subscribe(listener: Listener, filter?: { threadId?: string }): () => void;
  history(threadId: string, afterSeq: number): readonly Envelope[];
}

/** In-process pub/sub with a short per-thread replay buffer for reconnecting clients. */
export function createEventBus({ historyPerThread, now = Date.now }: { historyPerThread: number; now?: () => number }): EventBus {
  let seq = 0;
  const listeners = new Set<{ listener: Listener; threadId?: string }>();
  const recent = new Map<string, readonly Envelope[]>();

  return {
    publish(threadId, event) {
      seq += 1;
      const envelope: Envelope = { seq, at: now(), threadId, event };
      recent.set(threadId, [...(recent.get(threadId) ?? []), envelope].slice(-historyPerThread));
      listeners.forEach(({ listener, threadId: only }) => {
        if (only && only !== threadId) return;
        try {
          listener(envelope);
        } catch {
          // A broken subscriber (e.g. a closed socket) must not break the run.
        }
      });
      return envelope;
    },
    subscribe(listener, filter = {}) {
      const entry = { listener, ...filter };
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    history(threadId, afterSeq) {
      return (recent.get(threadId) ?? []).filter((envelope) => envelope.seq > afterSeq);
    },
  };
}
