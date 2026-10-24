import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeClock } from '../test-utils/clock.ts';
import { makeTree } from '../test-utils/tree.ts';
import { parseCron } from './cron.ts';
import { createScheduler, MAX_SLEEP_MS, type ScheduledRoutine } from './scheduler.ts';
import { createRoutineStateStore, type RoutineState } from './state-store.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (instant: number) => new Date(instant).toISOString();

// 2026-10-26 is a Monday.
const weekdays = (overrides: Partial<ScheduledRoutine> = {}): ScheduledRoutine => ({
  name: 'morning-check',
  cron: parseCron('0 8 * * 1-5'),
  timeZone: 'UTC',
  enabled: true,
  ...overrides,
});

function setup(start: string, { routines = [weekdays()], state = {} }: { routines?: ScheduledRoutine[]; state?: Record<string, RoutineState> } = {}) {
  const time = fakeClock(start);
  const store = createRoutineStateStore(join(makeTree({}), 'routines.json'));
  Object.entries(state).forEach(([name, value]) => store.update(name, () => value));
  const launched: { name: string; slot: string; at: string }[] = [];
  const logs: string[] = [];
  const busy = new Set<string>();
  let current = routines;
  let failing = new Set<string>();
  const scheduler = createScheduler({
    routines: () => current,
    store,
    clock: time.clock,
    isRunning: (name) => busy.has(name),
    launch: (name, slot) => {
      if (failing.has(name)) throw new Error('graph is down');
      launched.push({ name, slot: iso(slot), at: iso(time.clock.now()) });
    },
    log: (message) => logs.push(message),
  });
  return {
    time,
    store,
    scheduler,
    launched,
    logs,
    busy,
    setRoutines: (next: ScheduledRoutine[]) => {
      current = next;
    },
    failOn: (names: string[]) => {
      failing = new Set(names);
    },
  };
}

describe('createScheduler', () => {
  it('runs a routine at each scheduled time and not in between', () => {
    const { time, scheduler, launched } = setup('2026-10-23T07:30:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T07:00:00.000Z' } } });
    scheduler.start();
    expect(launched).toEqual([]);

    time.advanceTo('2026-10-23T08:00:00Z');
    expect(launched).toEqual([{ name: 'morning-check', slot: '2026-10-23T08:00:00.000Z', at: '2026-10-23T08:00:00.000Z' }]);

    // Over the weekend to Tuesday morning: Monday and Tuesday only.
    time.advanceTo('2026-10-27T09:00:00Z');
    expect(launched.map((run) => run.slot)).toEqual(['2026-10-23T08:00:00.000Z', '2026-10-26T08:00:00.000Z', '2026-10-27T08:00:00.000Z']);
  });

  it('remembers the settled time, so a restart does not run it again', () => {
    const first = setup('2026-10-26T07:59:00Z');
    first.store.update('morning-check', () => ({ settledUntil: '2026-10-23T08:00:00.000Z' }));
    first.scheduler.start();
    first.time.advance(MINUTE);
    expect(first.launched).toHaveLength(1);
    expect(first.store.get('morning-check').settledUntil).toBe('2026-10-26T08:00:00.000Z');
    first.scheduler.stop();

    const second = setup('2026-10-26T08:30:00Z', { state: { 'morning-check': first.store.get('morning-check') } });
    second.scheduler.start();
    expect(second.launched).toEqual([]);
  });

  describe('missed runs', () => {
    it('makes up once on start for a run missed within 12 hours', () => {
      const { scheduler, launched } = setup('2026-10-26T19:59:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' } } });
      scheduler.start();
      expect(launched).toEqual([{ name: 'morning-check', slot: '2026-10-26T08:00:00.000Z', at: '2026-10-26T19:59:00.000Z' }]);
    });

    it('does not make up a run missed more than 12 hours ago', () => {
      const { scheduler, launched, store } = setup('2026-10-26T20:01:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' } } });
      scheduler.start();
      expect(launched).toEqual([]);
      expect(store.get('morning-check').settledUntil).toBe('2026-10-23T08:00:00.000Z');
    });

    it('never makes up more than one run, however many were missed', () => {
      const routine = weekdays({ name: 'often', cron: parseCron('*/15 * * * *') });
      const { scheduler, launched } = setup('2026-10-26T10:05:00Z', { routines: [routine], state: { often: { settledUntil: '2026-10-25T23:00:00.000Z' } } });
      scheduler.start();
      expect(launched).toEqual([{ name: 'often', slot: '2026-10-26T10:00:00.000Z', at: '2026-10-26T10:05:00.000Z' }]);
    });

    it('makes up a run missed while the machine slept', () => {
      const { time, scheduler, launched } = setup('2026-10-26T07:00:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' } } });
      scheduler.start();
      time.sleep(3 * HOUR);
      expect(launched).toEqual([{ name: 'morning-check', slot: '2026-10-26T08:00:00.000Z', at: '2026-10-26T10:00:00.000Z' }]);
    });

    it('owes nothing from before it first saw the routine', () => {
      const { scheduler, launched, store } = setup('2026-10-26T08:30:00Z');
      scheduler.start();
      expect(launched).toEqual([]);
      expect(store.get('morning-check').settledUntil).toBe('2026-10-26T08:30:00.000Z');
    });
  });

  describe('switching on and off', () => {
    it('ignores disabled routines and forgets their settled time', () => {
      const { time, scheduler, launched, store } = setup('2026-10-26T07:00:00Z', {
        routines: [weekdays({ enabled: false })],
        state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z', enabled: false } },
      });
      scheduler.start();
      time.advanceTo('2026-10-27T09:00:00Z');
      expect(launched).toEqual([]);
      expect(store.get('morning-check')).toEqual({ enabled: false });
      // Nothing enabled: no timer either.
      expect(time.pendingTimers()).toBe(0);
    });

    it('does not run what was due before a routine was switched on', () => {
      const { time, scheduler, launched, setRoutines } = setup('2026-10-26T07:00:00Z', { routines: [weekdays({ enabled: false })] });
      scheduler.start();
      time.advanceTo('2026-10-26T09:00:00Z');
      setRoutines([weekdays()]);
      scheduler.refresh();
      expect(launched).toEqual([]);

      time.advanceTo('2026-10-27T08:00:00Z');
      expect(launched.map((run) => run.slot)).toEqual(['2026-10-27T08:00:00.000Z']);
    });

    it('does not run a time that became past because the schedule was edited', () => {
      const { time, scheduler, launched, setRoutines } = setup('2026-10-26T06:00:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' } } });
      scheduler.start();
      time.advanceTo('2026-10-26T07:30:00Z');
      setRoutines([weekdays({ cron: parseCron('0 7 * * 1-5') })]);
      scheduler.refresh();
      expect(launched).toEqual([]);
      time.advanceTo('2026-10-27T07:00:00Z');
      expect(launched.map((run) => run.slot)).toEqual(['2026-10-27T07:00:00.000Z']);
    });
  });

  it('never overlaps runs of one routine: a time due while the last run still goes is skipped', () => {
    const { time, scheduler, launched, logs, busy } = setup('2026-10-26T07:59:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' } } });
    busy.add('morning-check');
    scheduler.start();
    time.advance(MINUTE);
    expect(launched).toEqual([]);
    expect(logs.join('\n')).toMatch(/morning-check.*skipped.*still/);

    busy.delete('morning-check');
    time.advanceTo('2026-10-26T12:00:00Z');
    expect(launched).toEqual([]);
    time.advanceTo('2026-10-27T08:00:00Z');
    expect(launched).toHaveLength(1);
  });

  it('logs a run that cannot start and keeps scheduling the others', () => {
    const other = weekdays({ name: 'other' });
    const state = { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' }, other: { settledUntil: '2026-10-23T08:00:00.000Z' } };
    const { time, scheduler, launched, logs, failOn } = setup('2026-10-26T07:59:00Z', { routines: [weekdays(), other], state });
    failOn(['morning-check']);
    scheduler.start();
    time.advance(MINUTE);
    expect(launched.map((run) => run.name)).toEqual(['other']);
    expect(logs.join('\n')).toMatch(/morning-check.*graph is down/);

    failOn([]);
    time.advanceTo('2026-10-27T08:00:00Z');
    expect(launched.map((run) => run.name)).toEqual(['other', 'morning-check', 'other']);
  });

  it('wakes at the next run or within a minute, whichever is sooner, and stops cleanly', () => {
    const { time, scheduler } = setup('2026-10-26T07:59:30Z');
    scheduler.start();
    expect(time.nextDelay()).toBe(30_000);
    time.advanceTo('2026-10-26T08:00:00Z');
    expect(time.nextDelay()).toBe(MAX_SLEEP_MS);

    scheduler.stop();
    expect(time.pendingTimers()).toBe(0);
    scheduler.refresh();
    expect(time.pendingTimers()).toBe(0);
  });

  it('does nothing before it is started', () => {
    const { time, scheduler, launched } = setup('2026-10-26T08:30:00Z', { state: { 'morning-check': { settledUntil: '2026-10-23T08:00:00.000Z' } } });
    scheduler.refresh();
    expect(launched).toEqual([]);
    expect(time.pendingTimers()).toBe(0);
    scheduler.start();
    scheduler.start();
    expect(launched).toHaveLength(1);
  });
});
