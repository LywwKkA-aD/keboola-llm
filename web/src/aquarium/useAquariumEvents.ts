import { useEffect, useState } from 'react';
import { eventsUrl } from '../api/client.ts';
import type { Envelope } from '../api/types.ts';
import { type AquariumState, initialAquarium, reduceAquarium } from './state.ts';

const TICK_MS = 1000;

/** Listen to every chat at once and keep what each octopus is doing, plus a clock for fading effects. */
export function useAquariumEvents(lead: string): { state: AquariumState; now: number } {
  const [state, setState] = useState(() => initialAquarium(lead));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const source = new EventSource(eventsUrl());
    source.onmessage = (message: MessageEvent<string>) => {
      const envelope = JSON.parse(message.data) as Envelope;
      setState((current) => reduceAquarium(current, envelope, Date.now()));
    };
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, []);

  return { state, now };
}
