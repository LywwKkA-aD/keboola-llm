import type { Cron } from './cron.ts';
import { latestRun, nextRun } from './occurrences.ts';
import type { RoutineStateStore } from './state-store.ts';

/** Time, injectable so tests can move it by hand. */
export interface Clock {
  readonly now: () => number;
  /** Call back after `ms`; returns a function that cancels it. */
  readonly setTimer: (callback: () => void, ms: number) => () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer(callback, ms) {
    const timer = setTimeout(callback, ms);
    // The scheduler alone must never keep the process alive.
    timer.unref();
    return () => clearTimeout(timer);
  },
};

/** Longest sleep between checks, so a woken machine or a clock change is noticed within a minute. */
export const MAX_SLEEP_MS = 60_000;
/** A run missed while the app was off or the machine slept is made up for within this window, once. */
export const CATCH_UP_MS = 12 * 60 * 60_000;

/** What the scheduler needs to know about a routine; `enabled` already includes the user's switch. */
export interface ScheduledRoutine {
  readonly name: string;
  readonly cron: Cron;
  readonly timeZone: string;
  readonly enabled: boolean;
}

export interface Scheduler {
  /** Check now, making up for at most one run per routine missed in the last 12 h, and keep checking. */
  start(): void;
  /** Routines or their switches changed: check again without running what fell due before the change. */
  refresh(): void;
  stop(): void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Fires routines at their cron times. Per routine it keeps `settledUntil` in the state store: every
 * scheduled time up to it has run, was skipped, or was not owed (the routine was off). A time is run
 * when it lies after settledUntil, after the previous check in this process and within the last 12 h,
 * so a restart or a wake from sleep runs only the latest missed time, and a schedule edit runs nothing old.
 */
export function createScheduler({ routines, store, clock, isRunning, launch, log = () => {} }: {
  routines: () => readonly ScheduledRoutine[];
  store: RoutineStateStore;
  clock: Clock;
  /** Whether the routine's last run is still going (running or waiting for an approval). */
  isRunning: (name: string) => boolean;
  /** Start a run for the time `slot` (epoch ms) that fell due. */
  launch: (name: string, slot: number) => void;
  log?: (message: string) => void;
}): Scheduler {
  let started = false;
  let lastCheck: number | undefined;
  let cancelTimer: (() => void) | undefined;

  const settle = (routine: ScheduledRoutine, now: number) => {
    const { name } = routine;
    const { settledUntil } = store.get(name);
    if (!routine.enabled) {
      if (settledUntil) store.update(name, ({ settledUntil: _forgotten, ...rest }) => rest);
      return;
    }
    // First seen switched on: nothing from before now is owed.
    if (!settledUntil) {
      store.update(name, (state) => ({ ...state, settledUntil: new Date(now).toISOString() }));
      return;
    }
    const after = Math.max(Date.parse(settledUntil), lastCheck ?? Number.NEGATIVE_INFINITY, now - CATCH_UP_MS);
    const slot = latestRun(routine.cron, routine.timeZone, { after, until: now });
    if (slot === undefined) return;
    store.update(name, (state) => ({ ...state, settledUntil: new Date(slot).toISOString() }));
    if (isRunning(name)) {
      log(`[routines] ${name}: skipped the run due at ${new Date(slot).toISOString()}, the previous one is still going`);
      return;
    }
    try {
      launch(name, slot);
    } catch (error) {
      log(`[routines] ${name}: could not start the run due at ${new Date(slot).toISOString()}: ${message(error)}`);
    }
  };

  const arm = (now: number) => {
    cancelTimer?.();
    cancelTimer = undefined;
    const enabled = routines().filter((routine) => routine.enabled);
    if (!started || enabled.length === 0) return;
    const next = Math.min(...enabled.map((routine) => nextRun(routine.cron, now, routine.timeZone) ?? Number.POSITIVE_INFINITY));
    cancelTimer = clock.setTimer(check, Math.min(Math.max(next - now, 0), MAX_SLEEP_MS));
  };

  function check() {
    if (!started) return;
    const now = clock.now();
    routines().forEach((routine) => settle(routine, now));
    lastCheck = now;
    arm(now);
  }

  return {
    start() {
      if (started) return;
      started = true;
      check();
    },
    refresh: check,
    stop() {
      started = false;
      cancelTimer?.();
      cancelTimer = undefined;
    },
  };
}
