import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import { type InterruptAnswer, toResumeValue } from '../runtime/approvals.ts';
import { createEventMapper, type TeamEvent } from '../runtime/events.ts';
import type { EventBus } from './bus.ts';

export type PendingApproval = Extract<TeamEvent, { type: 'approval.required' }>;

/** The slice of a compiled LangGraph graph the run manager needs; easy to fake in tests. */
export interface StreamingGraph {
  stream(input: unknown, options: Record<string, unknown> & { signal?: AbortSignal }): Promise<AsyncIterable<unknown>>;
}

export interface RunHandle {
  readonly runId: string;
  readonly done: Promise<void>;
}

export interface RunManager {
  start(threadId: string, input: unknown): RunHandle;
  answer(threadId: string, answers: readonly InterruptAnswer[]): RunHandle;
  pending(threadId: string): readonly PendingApproval[];
  isBusy(threadId: string): boolean;
  cancel(threadId: string): boolean;
}

const RECURSION_LIMIT = 200;

export type RunErrorCode = 'RUN_CONFLICT' | 'RUN_INVALID';

/** Errors the API maps to HTTP status codes: conflict -> 409, invalid -> 400. */
export const runError = (code: RunErrorCode, message: string): Error & { code: RunErrorCode } =>
  Object.assign(new Error(message), { code });

/** Runs agent turns in the background, one per thread, publishing every event to the bus. */
export function createRunManager({ bus, getGraph, leadName }: {
  bus: EventBus;
  getGraph: () => StreamingGraph;
  leadName: () => string;
}): RunManager {
  const running = new Map<string, AbortController>();
  const waiting = new Map<string, readonly PendingApproval[]>();

  async function execute(threadId: string, runId: string, input: unknown, controller: AbortController): Promise<void> {
    const mapEvents = createEventMapper(leadName());
    const approvals: PendingApproval[] = [];
    bus.publish(threadId, { type: 'run.started', runId });
    try {
      const stream = await getGraph().stream(input, {
        configurable: { thread_id: threadId },
        streamMode: ['updates', 'messages'],
        subgraphs: true,
        recursionLimit: RECURSION_LIMIT,
        signal: controller.signal,
      });
      for await (const chunk of stream) {
        mapEvents(chunk).forEach((event) => {
          if (event.type === 'approval.required') approvals.push(event);
          bus.publish(threadId, event);
        });
      }
      if (approvals.length > 0) {
        waiting.set(threadId, approvals);
        bus.publish(threadId, { type: 'run.waiting', runId });
      } else {
        bus.publish(threadId, { type: 'run.finished', runId });
      }
    } catch (error) {
      bus.publish(threadId, { type: 'run.failed', runId, error: error instanceof Error ? error.message : String(error) });
    } finally {
      running.delete(threadId);
    }
  }

  function launch(threadId: string, input: unknown): RunHandle {
    const runId = randomUUID();
    const controller = new AbortController();
    running.set(threadId, controller);
    return { runId, done: execute(threadId, runId, input, controller) };
  }

  return {
    start(threadId, input) {
      if (running.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is busy with another run');
      if (waiting.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is waiting for an approval');
      return launch(threadId, input);
    },
    answer(threadId, answers) {
      const pending = waiting.get(threadId);
      if (!pending) throw runError('RUN_CONFLICT', 'No pending approvals for this thread');
      const ids = new Set(pending.map((approval) => approval.interruptId));
      if (answers.length !== ids.size || answers.some((answer) => !ids.has(answer.interruptId))) {
        throw runError('RUN_INVALID', 'Answers must cover exactly the pending interrupt ids');
      }
      pending.forEach((approval) => {
        const answer = answers.find((entry) => entry.interruptId === approval.interruptId);
        if (answer?.decisions.length !== approval.requests.length) {
          throw runError('RUN_INVALID', `Interrupt ${approval.interruptId} needs ${approval.requests.length} decision(s)`);
        }
      });
      waiting.delete(threadId);
      return launch(threadId, new Command({ resume: toResumeValue(answers) }));
    },
    pending: (threadId) => waiting.get(threadId) ?? [],
    isBusy: (threadId) => running.has(threadId) || waiting.has(threadId),
    cancel(threadId) {
      const controller = running.get(threadId);
      controller?.abort();
      return Boolean(controller);
    },
  };
}
