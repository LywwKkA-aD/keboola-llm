import { useCallback, useEffect, useRef, useState } from 'react';
import { api, eventsUrl } from '../api/client.ts';
import type { Envelope } from '../api/types.ts';
import { initialLive, type LiveState, reconcileLive, reduceLive, seedFeed } from '../live/live-state.ts';
import { type AquariumState, initialAquarium, reduceAquarium, settleInactive } from './state.ts';

const TICK_MS = 1000;

export interface AquariumEvents {
  readonly state: AquariumState;
  readonly now: number;
  /** The event stream is open. */
  readonly connected: boolean;
  /** Runs, approvals, feed and usage across all chats. */
  readonly live: LiveState;
  /** Bumped when the stream comes back after a drop (e.g. a server restart): ask the server what is going on. */
  readonly reconnects: number;
  /** How many events arrived so far: pass it to reconcile, which then ignores a snapshot older than an event. */
  readonly mark: () => number;
  /** Take the server's running and waiting chats (GET /api/status) as the truth, unless events arrived since `since`. */
  readonly reconcile: (running: readonly string[], waiting: readonly string[], since: number) => void;
}

/** Listen to every chat at once: what each octopus is doing, the live summary, and a clock for fading effects. */
export function useAquariumEvents(lead: string): AquariumEvents {
  const [state, setState] = useState(() => initialAquarium(lead));
  const [live, setLive] = useState(initialLive);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reconnects, setReconnects] = useState(0);
  const seen = useRef(0);
  const mark = useCallback(() => seen.current, []);
  const reconcile = useCallback((running: readonly string[], waiting: readonly string[], since: number) => {
    if (seen.current !== since) return;
    const active = new Set([...running, ...waiting]);
    setLive((current) => reconcileLive(current, running, waiting));
    setState((current) => settleInactive(current, active, Date.now()));
  }, []);

  // The lead name arrives with /api/team after the first render; keep what we already know.
  useEffect(() => {
    setState((current) => (current.lead === lead ? current : { ...current, lead }));
  }, [lead]);

  useEffect(() => {
    const source = new EventSource(eventsUrl());
    let dropped = false;
    source.onopen = () => {
      setConnected(true);
      if (dropped) setReconnects((count) => count + 1);
      dropped = false;
    };
    source.onerror = () => {
      dropped = true;
      setConnected(false);
    };
    source.onmessage = (message: MessageEvent<string>) => {
      const envelope = JSON.parse(message.data) as Envelope;
      seen.current += 1;
      const at = Date.now();
      setState((current) => reduceAquarium(current, envelope, at));
      setLive((current) => reduceLive(current, envelope, at));
    };
    // What the team did before this page loaded, so agent cards are not empty after a reload.
    let alive = true;
    api
      .activity()
      .then((entries) => {
        if (alive) setLive((current) => seedFeed(current, entries));
      })
      .catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      alive = false;
      source.close();
      clearInterval(timer);
    };
  }, []);

  return { state, now, connected, live, reconnects, mark, reconcile };
}
