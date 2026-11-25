import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api, eventsUrl } from '../api/client.ts';
import type { BusEvent, Envelope } from '../api/types.ts';
import { initialRunState, reduceRun, type RunState, type ServerRun, syncRun } from '../state/run-state.ts';

const RUN_END = new Set(['run.finished', 'run.waiting', 'run.failed']);
/** A sync that keeps meeting newer events gives up after this many tries; the next run end or reconnect asks again. */
const SYNC_TRIES = 3;

type Action = { readonly event: BusEvent; readonly at: number } | { readonly sync: ServerRun };

const reduce = (state: RunState, action: Action) => ('sync' in action ? syncRun(state, action.sync) : reduceRun(state, action.event, action.at));

export interface ThreadEventHandlers {
  /** A run ended (finished, paused for approval, failed): reload what it changed. */
  readonly onRunEnd?: () => void;
  /**
   * A new turn started (not a resume), e.g. from another tab, and again at its first step: the history should now
   * hold the message that started it.
   */
  readonly onNewTurn?: () => void;
  /** The stream reconnected (network drop, server restart): events may have been missed. */
  readonly onReconnect?: () => void;
}

export interface ThreadEvents {
  readonly run: RunState;
  /** Ask the server what the run is doing and reconcile (e.g. after it refused an action as out of date). */
  readonly resync: () => void;
}

/**
 * Subscribe to one thread's server-sent events and fold them into run state. The server replays the thread's recent
 * events on connect, so reopening a chat restores its activity; what the replay cannot tell (a run that started
 * earlier, one a restart ended) comes from GET /api/threads/:id/run on open, on reconnect and at every run end.
 */
export function useThreadEvents(threadId: string | undefined, lead: string, handlers: ThreadEventHandlers = {}): ThreadEvents {
  const [run, dispatch] = useReducer(reduce, lead, initialRunState);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  // Events received so far: a sync answer is only applied when no event arrived while it was on its way.
  const seen = useRef(0);

  const resync = useCallback(() => {
    if (!threadId) return;
    let alive = true;
    const attempt = (tries: number) => {
      const mark = seen.current;
      api
        .threadRun(threadId)
        .then((server) => {
          if (!alive) return;
          if (seen.current === mark) dispatch({ sync: server });
          else if (tries > 1) attempt(tries - 1);
        })
        .catch(() => {});
    };
    attempt(SYNC_TRIES);
    return () => {
      alive = false;
    };
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return undefined;
    const source = new EventSource(eventsUrl(threadId));
    let dropped = false;
    let awaitingFirstStep = false;
    source.onerror = () => {
      dropped = true;
    };
    source.onopen = () => {
      if (!dropped) return;
      dropped = false;
      handlersRef.current.onReconnect?.();
      resync();
    };
    source.onmessage = (message: MessageEvent<string>) => {
      const { event, at } = JSON.parse(message.data) as Envelope;
      seen.current += 1;
      dispatch({ event, at: at ?? Date.now() });
      if (event.type === 'run.started' && !event.resume) {
        awaitingFirstStep = true;
        handlersRef.current.onNewTurn?.();
      } else if (awaitingFirstStep && !event.type.startsWith('run.')) {
        awaitingFirstStep = false;
        handlersRef.current.onNewTurn?.();
      }
      if (RUN_END.has(event.type)) {
        handlersRef.current.onRunEnd?.();
        resync();
      }
    };
    const stop = resync();
    return () => {
      stop?.();
      source.close();
    };
  }, [threadId, resync]);

  return { run, resync };
}
