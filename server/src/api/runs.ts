import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import { type InterruptAnswer, toResumeValue } from '../runtime/approvals.ts';
import { type ApprovalRequest, createEventMapper, type TeamEvent } from '../runtime/events.ts';
import type { EventBus } from './bus.ts';
import { describeFailure } from './failure.ts';

export type PendingApproval = Extract<TeamEvent, { type: 'approval.required' }>;

/** Decides whether one approval request may be approved without asking the user. */
export type AutoApprove = (threadId: string, request: ApprovalRequest) => boolean;

/** Upper bound of automatic resumes in one run, so a looping agent cannot spin forever unattended. */
export const MAX_AUTO_RESUMES = 25;

/** A run paused on interrupts, until the user answers. */
export interface Waiting {
  readonly human: readonly PendingApproval[];
  // Auto-approved interrupts from the same pause; they are resumed together with the human answers.
  readonly auto: readonly InterruptAnswer[];
  // Human answers given so far, when several agents wait at once: the run resumes once every interrupt is answered.
  readonly answered?: readonly InterruptAnswer[];
}

/** An answer to some of a thread's approvals: a run when it was the last one missing, else how many are left. */
export interface AnswerResult {
  readonly runId?: string;
  readonly remaining: number;
  readonly done: Promise<void>;
}

/** Keeps paused runs across server restarts; the graph state itself is in the checkpointer. */
export interface PendingStore {
  load(): ReadonlyMap<string, Waiting>;
  save(waiting: ReadonlyMap<string, Waiting>): void;
}

const approveAll = (approval: PendingApproval): InterruptAnswer => ({
  interruptId: approval.interruptId,
  decisions: approval.requests.map(() => ({ type: 'approve' })),
});

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
  /** Answer some or all pending approvals; the run resumes once none is left. */
  answer(threadId: string, answers: readonly InterruptAnswer[]): AnswerResult;
  /** Continue a run that stopped before it finished, from the last checkpoint, as the same turn. */
  resume(threadId: string): RunHandle;
  /** Approvals still waiting for an answer. */
  pending(threadId: string): readonly PendingApproval[];
  isBusy(threadId: string): boolean;
  cancel(threadId: string): boolean;
  /** Threads with a run executing now (not counting ones paused for approval). */
  active(): readonly string[];
  /** Threads paused for approval, including ones restored after a restart. */
  waitingThreads(): readonly string[];
  /** Threads whose last run stopped before it finished (failed, stopped by the user, cut off by a restart). */
  resumable(): readonly string[];
  /** Forget a paused or unfinished run without resuming it (its chat was deleted or its interrupts are gone). */
  discard(threadId: string): void;
}

const RECURSION_LIMIT = 200;

export type RunErrorCode = 'RUN_CONFLICT' | 'RUN_INVALID';

/** Errors the API maps to HTTP status codes: conflict -> 409, invalid -> 400. */
export const runError = (code: RunErrorCode, message: string): Error & { code: RunErrorCode } =>
  Object.assign(new Error(message), { code });

/**
 * Runs agent turns in the background, one per thread, publishing every event to the bus.
 * With autoApprove, interrupts whose every request it accepts are answered without the user
 * (announced as approval.auto) and the run continues under the same run id.
 * A run that fails or is stopped stays resumable: resume streams a null input on the thread, which
 * LangGraph takes as "continue from the last checkpoint". resumable seeds the chats a restart cut off.
 */
export function createRunManager({ bus, getGraph, leadName, autoApprove, store, resumable = [] }: {
  bus: EventBus;
  getGraph: () => StreamingGraph;
  leadName: () => string;
  autoApprove?: AutoApprove;
  store?: PendingStore;
  resumable?: readonly string[];
}): RunManager {
  const running = new Map<string, AbortController>();
  const waiting = new Map<string, Waiting>(store?.load());
  const unfinished = new Set(resumable);
  const pause = (threadId: string, paused: Waiting) => {
    waiting.set(threadId, paused);
    store?.save(waiting);
  };
  const unpause = (threadId: string) => {
    if (waiting.delete(threadId)) store?.save(waiting);
  };

  const isAutomatic = (threadId: string, approval: PendingApproval) =>
    autoApprove !== undefined &&
    approval.requests.length > 0 &&
    approval.requests.every((request) => autoApprove(threadId, request));

  /** Stream one segment of a run, until it ends or pauses on interrupts. */
  async function streamSegment(
    threadId: string,
    input: unknown,
    controller: AbortController,
    mapEvents: (chunk: unknown) => TeamEvent[],
  ): Promise<Waiting> {
    const human: PendingApproval[] = [];
    const auto: InterruptAnswer[] = [];
    const stream = await getGraph().stream(input, {
      configurable: { thread_id: threadId },
      streamMode: ['updates', 'messages'],
      subgraphs: true,
      recursionLimit: RECURSION_LIMIT,
      signal: controller.signal,
    });
    for await (const chunk of stream) {
      mapEvents(chunk).forEach((event) => {
        if (event.type === 'approval.required' && isAutomatic(threadId, event)) {
          auto.push(approveAll(event));
          bus.publish(threadId, { type: 'approval.auto', interruptId: event.interruptId, requests: event.requests });
          return;
        }
        if (event.type === 'approval.required') human.push(event);
        bus.publish(threadId, event);
      });
    }
    return { human, auto };
  }

  async function execute(threadId: string, runId: string, firstInput: unknown, controller: AbortController, resume: boolean): Promise<void> {
    const mapEvents = createEventMapper(leadName());
    bus.publish(threadId, { type: 'run.started', runId, ...(resume ? { resume: true as const } : {}) });
    try {
      let input = firstInput;
      for (let resumes = 0; ; resumes += 1) {
        const paused = await streamSegment(threadId, input, controller, mapEvents);
        if (paused.human.length > 0) {
          pause(threadId, paused);
          bus.publish(threadId, { type: 'run.waiting', runId });
          return;
        }
        if (paused.auto.length === 0) {
          bus.publish(threadId, { type: 'run.finished', runId });
          return;
        }
        if (resumes >= MAX_AUTO_RESUMES) {
          throw new Error(`Stopped after ${MAX_AUTO_RESUMES} automatic approvals in one run; ask the agent to continue.`);
        }
        input = new Command({ resume: toResumeValue(paused.auto) });
      }
    } catch (error) {
      // Resumable before anyone hears of the failure: the UI refetches the chats on run.failed.
      unfinished.add(threadId);
      bus.publish(threadId, { type: 'run.failed', runId, ...describeFailure(error, { stopped: controller.signal.aborted }) });
    } finally {
      running.delete(threadId);
    }
  }

  function launch(threadId: string, input: unknown, resume = false): RunHandle {
    const runId = randomUUID();
    const controller = new AbortController();
    running.set(threadId, controller);
    unfinished.delete(threadId);
    return { runId, done: execute(threadId, runId, input, controller, resume) };
  }

  return {
    start(threadId, input) {
      if (running.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is busy with another run');
      if (waiting.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is waiting for an approval');
      return launch(threadId, input);
    },
    answer(threadId, answers) {
      const paused = waiting.get(threadId);
      if (!paused) throw runError('RUN_CONFLICT', 'No pending approvals for this thread');
      const given = paused.answered ?? [];
      const open = paused.human.filter((approval) => !given.some((answer) => answer.interruptId === approval.interruptId));
      answers.forEach((answer) => {
        const approval = open.find((entry) => entry.interruptId === answer.interruptId);
        // Answered elsewhere already (another page, another tab) or never asked: the caller's view is out of date.
        if (!approval) throw runError('RUN_CONFLICT', `Approval ${answer.interruptId} is not waiting for an answer`);
        if (answer.decisions.length !== approval.requests.length) {
          throw runError('RUN_INVALID', `Interrupt ${approval.interruptId} needs ${approval.requests.length} decision(s)`);
        }
      });
      if (answers.length === 0 || new Set(answers.map((answer) => answer.interruptId)).size !== answers.length) {
        throw runError('RUN_INVALID', 'Give one answer per approval');
      }
      const answered = [...given, ...answers];
      const remaining = open.length - answers.length;
      bus.publish(threadId, { type: 'approval.answered', interruptIds: answers.map((answer) => answer.interruptId), remaining });
      if (remaining > 0) {
        pause(threadId, { ...paused, answered });
        return { remaining, done: Promise.resolve() };
      }
      unpause(threadId);
      // In the order the interrupts were asked, after the auto-approved ones.
      const ordered = paused.human.flatMap((approval) => answered.filter((answer) => answer.interruptId === approval.interruptId));
      const { runId, done } = launch(threadId, new Command({ resume: toResumeValue([...paused.auto, ...ordered]) }), true);
      return { runId, remaining: 0, done };
    },
    resume(threadId) {
      if (running.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is busy with another run');
      if (waiting.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is waiting for an approval');
      if (!unfinished.has(threadId)) throw runError('RUN_CONFLICT', 'Nothing to continue in this chat');
      return launch(threadId, null, true);
    },
    pending(threadId) {
      const paused = waiting.get(threadId);
      const given = paused?.answered ?? [];
      return (paused?.human ?? []).filter((approval) => !given.some((answer) => answer.interruptId === approval.interruptId));
    },
    isBusy: (threadId) => running.has(threadId) || waiting.has(threadId),
    active: () => [...running.keys()],
    waitingThreads: () => [...waiting.keys()],
    resumable: () => [...unfinished],
    discard(threadId) {
      unfinished.delete(threadId);
      unpause(threadId);
    },
    cancel(threadId) {
      const controller = running.get(threadId);
      controller?.abort();
      return Boolean(controller);
    },
  };
}
