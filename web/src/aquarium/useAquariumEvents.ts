import { useEffect, useState } from 'react';
import { eventsUrl } from '../api/client.ts';
import type { Envelope } from '../api/types.ts';
import { initialLive, type LiveState, reduceLive } from '../live/live-state.ts';
import { type AquariumState, initialAquarium, reduceAquarium } from './state.ts';

const TICK_MS = 1000;

export interface AquariumEvents {
  readonly state: AquariumState;
  readonly now: number;
  /** The event stream is open. */
  readonly connected: boolean;
  /** Runs, approvals, feed and usage across all chats. */
  readonly live: LiveState;
}

/** Listen to every chat at once: what each octopus is doing, the live summary, and a clock for fading effects. */
export function useAquariumEvents(lead: string): AquariumEvents {
  const [state, setState] = useState(() => initialAquarium(lead));
  const [live, setLive] = useState(initialLive);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The lead name arrives with /api/team after the first render; keep what we already know.
  useEffect(() => {
    setState((current) => (current.lead === lead ? current : { ...current, lead }));
  }, [lead]);

  useEffect(() => {
    const source = new EventSource(eventsUrl());
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message: MessageEvent<string>) => {
      const envelope = JSON.parse(message.data) as Envelope;
      const at = Date.now();
      setState((current) => reduceAquarium(current, envelope, at));
      setLive((current) => reduceLive(current, envelope, at));
    };
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, []);

  return { state, now, connected, live };
}
