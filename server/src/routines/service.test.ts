import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { type RunManager, runError } from '../api/runs.ts';
import { createThreadStore } from '../api/threads.ts';
import type { WatchFn } from '../runtime/watch.ts';
import { fakeClock } from '../test-utils/clock.ts';
import { makeTree } from '../test-utils/tree.ts';
import { createRoutines } from './service.ts';

const routineMd = (name: string, schedule: string, extra = '') =>
  `---\nname: ${name}\ndescription: A routine for the tests.\nschedule: "${schedule}"\n${extra}---\n\nDo the ${name} thing.\n`;

function fakeRuns(): Pick<RunManager, 'start' | 'isBusy'> & { started: string[]; busy: Set<string> } {
  const started: string[] = [];
  const busy = new Set<string>();
  return {
    started,
    busy,
    start(threadId) {
      if (busy.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is busy with another run');
      started.push(threadId);
      busy.add(threadId);
      return { runId: `run-${started.length}`, done: Promise.resolve() };
    },
    isBusy: (threadId) => busy.has(threadId),
  };
}

function setup(start = '2026-10-26T07:30:00Z', { files = {}, state }: { files?: Record<string, string>; state?: string } = {}) {
  const root = makeTree({
    'routines/morning-check.md': routineMd('morning-check', '0 8 * * 1-5', 'title: Morning check\n'),
    'routines/weekly.md': routineMd('weekly', '0 7 * * 1', 'timezone: Europe/Prague\nenabled: true\n'),
    ...(state === undefined ? {} : { 'data/routines.json': state }),
    ...files,
  });
  const dataDir = join(root, 'data');
  const time = fakeClock(start);
  const threads = createThreadStore(join(dataDir, 'threads.json'));
  const runs = fakeRuns();
  const logs: string[] = [];
  const watchers: (() => void)[] = [];
  const watch: WatchFn = (_path, listener) => {
    watchers.push(listener);
    return { close: () => {} };
  };
  const routines = createRoutines({
    rootDir: root,
    dataDir,
    threads,
    runs,
    clock: time.clock,
    timeZone: () => 'UTC',
    watch,
    debounceMs: 10,
    logger: { log: (message) => logs.push(message), warn: (message) => logs.push(`WARN ${message}`) },
  });
  return { root, dataDir, time, threads, runs, logs, routines, api: routines.api, fireWatcher: () => watchers.forEach((listener) => listener()) };
}

describe('createRoutines', () => {
  it('lists routines with their zone, switch, next run and last run', () => {
    const { api } = setup();
    expect(api.list()).toEqual({
      routines: [
        {
          name: 'morning-check',
          title: 'Morning check',
          description: 'A routine for the tests.',
          schedule: '0 8 * * 1-5',
          timezone: 'UTC',
          enabled: false,
        },
        {
          name: 'weekly',
          title: 'Weekly',
          description: 'A routine for the tests.',
          schedule: '0 7 * * 1',
          timezone: 'Europe/Prague',
          enabled: true,
          // Monday 07:00 in Prague has passed at 07:30Z: next week.
          nextRun: '2026-11-02T06:00:00.000Z',
        },
      ],
      loadErrors: [],
    });
  });

  it('keeps the switch in the data dir, never in the routine file', () => {
    const { api, root, dataDir } = setup();
    const before = readFileSync(join(root, 'routines', 'morning-check.md'), 'utf8');

    expect(api.setEnabled('morning-check', true)).toMatchObject({ enabled: true, nextRun: '2026-10-26T08:00:00.000Z' });
    expect(api.setEnabled('weekly', false)).toMatchObject({ enabled: false });
    expect(api.list().routines.find((routine) => routine.name === 'weekly')?.nextRun).toBeUndefined();

    expect(readFileSync(join(root, 'routines', 'morning-check.md'), 'utf8')).toBe(before);
    const stored = JSON.parse(readFileSync(join(dataDir, 'routines.json'), 'utf8')) as Record<string, { enabled?: boolean }>;
    expect(stored['morning-check']?.enabled).toBe(true);
    expect(stored.weekly?.enabled).toBe(false);
    expect(api.setEnabled('nope', true)).toBeUndefined();
  });

  it('runs a routine now in a new chat and reports it as the last run', () => {
    const { api, runs, threads } = setup();
    const started = api.runNow('morning-check');

    expect(started).toEqual({ threadId: expect.any(String) });
    const threadId = started?.threadId ?? '';
    expect(threads.get(threadId)?.title).toBe('Morning check · 2026-10-26');
    expect(runs.started).toEqual([threadId]);
    expect(api.list().routines[0]?.lastRun).toEqual({ at: '2026-10-26T07:30:00.000Z', threadId, running: true });

    // No second run while the first still goes (409 at the API).
    expect(() => api.runNow('morning-check')).toThrow(expect.objectContaining({ code: 'RUN_CONFLICT' }));
    runs.busy.delete(threadId);
    expect(api.list().routines[0]?.lastRun?.running).toBe(false);
    expect(api.runNow('nope')).toBeUndefined();
  });

  it('forgets the last run once its chat is deleted', () => {
    const { api, threads } = setup();
    const threadId = api.runNow('morning-check')?.threadId ?? '';
    threads.remove(threadId);
    expect(api.list().routines[0]?.lastRun).toBeUndefined();
  });

  it('runs enabled routines on schedule once started, and stops', () => {
    const { api, routines, time, runs, threads, logs } = setup();
    api.setEnabled('morning-check', true);
    routines.start();
    time.advanceTo('2026-10-26T08:00:00Z');

    expect(runs.started).toHaveLength(1);
    expect(threads.get(runs.started[0] ?? '')?.title).toBe('Morning check · 2026-10-26');
    expect(logs.join('\n')).toMatch(/morning-check: started/);

    routines.stop();
    time.advanceTo('2026-10-27T08:00:00Z');
    expect(runs.started).toHaveLength(1);
  });

  it('makes up a run missed while the app was off', () => {
    const first = setup('2026-10-23T07:00:00Z');
    first.routines.start();
    first.api.setEnabled('morning-check', true);
    first.routines.stop();

    // The same data started again on Monday at 09:15: Friday 08:00 is more than 12 h ago and is not made up,
    // Monday's runs (08:00 UTC, and 07:00 Prague for weekly) are, once each.
    const second = setup('2026-10-26T09:15:00Z', { state: readFileSync(join(first.dataDir, 'routines.json'), 'utf8') });
    second.routines.start();
    expect(second.runs.started.map((threadId) => second.threads.get(threadId)?.title).toSorted()).toEqual([
      'Morning check · 2026-10-26',
      'Weekly · 2026-10-26',
    ]);
    second.time.advance(60 * 60_000);
    expect(second.runs.started).toHaveLength(2);
    second.routines.stop();
  });

  it('reloads routines/ on change and reports files it cannot load', async () => {
    const { routines, root, api, logs, runs, fireWatcher } = setup();
    routines.start();
    writeFileSync(join(root, 'routines', 'broken.md'), routineMd('broken', '0 99 * * *'));
    writeFileSync(join(root, 'routines', 'nightly.md'), routineMd('nightly', '0 2 * * *', 'enabled: true\n'));
    fireWatcher();

    await vi.waitFor(() => expect(api.list().routines.map((routine) => routine.name)).toEqual(['morning-check', 'nightly', 'weekly']));
    expect(api.list().loadErrors).toEqual([{ file: 'routines/broken.md', message: expect.stringMatching(/hour/) }]);
    expect(logs.join('\n')).toMatch(/WARN \[load\] routines\/broken.md: .*hour/);
    // A routine that appears while the app runs owes nothing from before.
    expect(runs.started).toEqual([]);
    routines.stop();
  });

  it('logs load errors on start', () => {
    const { routines, logs } = setup(undefined, { files: { 'routines/bad.md': '---\nname: bad\n---\n' } });
    routines.start();
    expect(logs.join('\n')).toMatch(/WARN \[load\] routines\/bad.md/);
    routines.stop();
  });
});
