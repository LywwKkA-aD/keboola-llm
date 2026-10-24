import type { Clock } from '../routines/scheduler.ts';

interface Timer {
  readonly at: number;
  readonly callback: () => void;
}

/** A clock the test moves by hand. Timers fire in order as time passes, like setTimeout. */
export function fakeClock(start: string) {
  let now = Date.parse(start);
  let timers: readonly Timer[] = [];

  const takeDue = (until: number): Timer | undefined => {
    const due = timers.filter((timer) => timer.at <= until).toSorted((a, b) => a.at - b.at)[0];
    if (due) timers = timers.filter((timer) => timer !== due);
    return due;
  };

  const clock: Clock = {
    now: () => now,
    setTimer(callback, ms) {
      const timer = { at: now + ms, callback };
      timers = [...timers, timer];
      return () => {
        timers = timers.filter((entry) => entry !== timer);
      };
    },
  };

  return {
    clock,
    /** Let time pass, firing each timer at its own time. */
    advance(ms: number) {
      const end = now + ms;
      for (let due = takeDue(end); due; due = takeDue(end)) {
        now = due.at;
        due.callback();
      }
      now = end;
    },
    advanceTo(iso: string) {
      this.advance(Date.parse(iso) - now);
    },
    /** The machine slept: the clock jumps and overdue timers fire only on waking. */
    sleep(ms: number) {
      now += ms;
      for (let due = takeDue(now); due; due = takeDue(now)) due.callback();
    },
    pendingTimers: () => timers.length,
    /** Delay of the next timer from now, or undefined without one. */
    nextDelay: () => (timers.length === 0 ? undefined : Math.min(...timers.map((timer) => timer.at)) - now),
  };
}
