import { useEffect, useReducer, useRef } from 'react';
import { eventsUrl } from '../api/client.ts';
import type { BusEvent, Envelope } from '../api/types.ts';
import { initialRunState, reduceRun, type RunState } from '../state/run-state.ts';

const RUN_END = new Set(['run.finished', 'run.waiting', 'run.failed']);

interface Received {
  readonly event: BusEvent;
  readonly at: number;
}

const reduceReceived = (state: RunState, { event, at }: Received) => reduceRun(state, event, at);

/**
 * Subscribe to one thread's server-sent events and fold them into run state. The server replays
 * the thread's recent events on connect, so reopening a chat restores its approvals and activity.
 */
export function useThreadEvents(threadId: string | undefined, lead: string, onRunEnd: () => void): RunState {
  const [state, dispatch] = useReducer(reduceReceived, lead, initialRunState);
  const onRunEndRef = useRef(onRunEnd);
  onRunEndRef.current = onRunEnd;

  useEffect(() => {
    if (!threadId) return undefined;
    const source = new EventSource(eventsUrl(threadId));
    source.onmessage = (message: MessageEvent<string>) => {
      const envelope = JSON.parse(message.data) as Envelope;
      dispatch({ event: envelope.event, at: Date.now() });
      if (RUN_END.has(envelope.event.type)) onRunEndRef.current();
    };
    return () => source.close();
  }, [threadId]);

  return state;
}
