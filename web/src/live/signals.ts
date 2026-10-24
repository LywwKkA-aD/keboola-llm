import type { Envelope } from '../api/types.ts';

/** What someone away from the tab wants to hear about: the team waits for them, or a run is over. */
export type SignalKind = 'approval' | 'finished' | 'failed';

export interface Signal {
  /** Counts up from 1 in this page; the server's sequence starts over when the server restarts. */
  readonly id: number;
  readonly threadId: string;
  readonly kind: SignalKind;
  /** The agent that asks for an approval; empty when the event does not say (a run's end is the lead's). */
  readonly agent: string;
}

const SIGNAL_LIMIT = 20;

/** The signal one server event raises, if any. Only names and ids: never tool arguments or error text. */
function signalOf({ threadId, event }: Envelope): Omit<Signal, 'id'> | undefined {
  switch (event.type) {
    case 'approval.required':
      return { threadId, kind: 'approval', agent: event.requests.find((request) => request.agent)?.agent ?? '' };
    case 'run.finished':
      return { threadId, kind: 'finished', agent: '' };
    case 'run.failed':
      return { threadId, kind: 'failed', agent: '' };
    default:
      return undefined;
  }
}

/** Append the signal an event raises (oldest first, capped); the same list when it raises none. Pure. */
export function pushSignal(signals: readonly Signal[], envelope: Envelope): readonly Signal[] {
  const signal = signalOf(envelope);
  if (!signal) return signals;
  return [...signals, { ...signal, id: (signals.at(-1)?.id ?? 0) + 1 }].slice(-SIGNAL_LIMIT);
}
