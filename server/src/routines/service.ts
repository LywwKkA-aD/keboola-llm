import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type RunManager, runError } from '../api/runs.ts';
import type { ThreadStore } from '../api/threads.ts';
import { loadRoutines, type RoutineDefinition } from '../registry/routines.ts';
import { type WatchFn, watchFolders } from '../runtime/watch.ts';
import { createRoutineLauncher } from './launch.ts';
import { nextRun } from './occurrences.ts';
import { type Clock, createScheduler, systemClock } from './scheduler.ts';
import { createRoutineStateStore } from './state-store.ts';
import type { RoutineInfo, RoutinesApi } from './types.ts';
import { systemTimeZone } from './zone.ts';

export interface Routines {
  readonly api: RoutinesApi;
  /** Report load errors, watch routines/ and start the scheduler (with its one catch-up run per routine). */
  start(): void;
  stop(): void;
}

interface Logger {
  log(message: string): void;
  warn(message: string): void;
}

const iso = (instant: number) => new Date(instant).toISOString();

/**
 * Scheduled routines: routines/<name>.md files (hot-reloaded like agents), the user's switches and
 * last runs in DATA_DIR/routines.json, and a scheduler that starts each run as a new chat.
 */
export function createRoutines({ rootDir, dataDir, threads, runs, clock = systemClock, timeZone = systemTimeZone, watch, debounceMs = 400, logger = console }: {
  rootDir: string;
  dataDir: string;
  threads: Pick<ThreadStore, 'create' | 'rename' | 'remove' | 'get'>;
  runs: Pick<RunManager, 'start' | 'isBusy'>;
  clock?: Clock;
  /** Zone of routines that do not name one: the machine's. */
  timeZone?: () => string;
  watch?: WatchFn;
  debounceMs?: number;
  logger?: Logger;
}): Routines {
  const dir = join(rootDir, 'routines');
  const store = createRoutineStateStore(join(dataDir, 'routines.json'));
  const launcher = createRoutineLauncher({ threads, runs });
  let loaded = loadRoutines(rootDir);
  let stopWatching: (() => void) | undefined;

  const find = (name: string) => loaded.items.find((routine) => routine.name === name);
  const zoneOf = (routine: RoutineDefinition) => routine.timezone ?? timeZone();
  const isEnabled = (routine: RoutineDefinition) => store.get(routine.name).enabled ?? routine.enabled;
  const isRunning = (name: string) => {
    const last = store.get(name).lastRun;
    return last !== undefined && runs.isBusy(last.threadId);
  };

  const launch = (routine: RoutineDefinition) => {
    const at = clock.now();
    const threadId = launcher(routine, at, zoneOf(routine));
    store.update(routine.name, (state) => ({ ...state, lastRun: { at: iso(at), threadId } }));
    logger.log(`[routines] ${routine.name}: started chat ${threadId}`);
    return threadId;
  };

  const scheduler = createScheduler({
    routines: () => loaded.items.map((routine) => ({ name: routine.name, cron: routine.cron, timeZone: zoneOf(routine), enabled: isEnabled(routine) })),
    store,
    clock,
    isRunning,
    launch: (name) => {
      const routine = find(name);
      if (routine) launch(routine);
    },
    log: (message) => logger.warn(message),
  });

  const reportErrors = () => loaded.errors.forEach((error) => logger.warn(`[load] ${error.file}: ${error.message}`));

  // agent-builder (or the user) edits routines/ on disk: re-read and reschedule, keeping the switches.
  const reload = () => {
    loaded = loadRoutines(rootDir);
    reportErrors();
    logger.log(`Routines reloaded: ${loaded.items.length}`);
    scheduler.refresh();
  };

  const info = (routine: RoutineDefinition): RoutineInfo => {
    const timezone = zoneOf(routine);
    const enabled = isEnabled(routine);
    const next = enabled ? nextRun(routine.cron, clock.now(), timezone) : undefined;
    const last = store.get(routine.name).lastRun;
    // A run whose chat the user deleted has nothing left to link to.
    const lastRun = last && threads.get(last.threadId) ? { ...last, running: runs.isBusy(last.threadId) } : undefined;
    return {
      name: routine.name,
      title: routine.title,
      description: routine.description,
      schedule: routine.schedule,
      timezone,
      enabled,
      ...(next === undefined ? {} : { nextRun: iso(next) }),
      ...(lastRun ? { lastRun } : {}),
    };
  };

  return {
    api: {
      list: () => ({ routines: loaded.items.map(info), loadErrors: loaded.errors }),
      setEnabled(name, enabled) {
        const routine = find(name);
        if (!routine) return undefined;
        store.update(name, (state) => ({ ...state, enabled }));
        scheduler.refresh();
        return info(routine);
      },
      runNow(name) {
        const routine = find(name);
        if (!routine) return undefined;
        if (isRunning(name)) throw runError('RUN_CONFLICT', 'This routine is still running');
        return { threadId: launch(routine) };
      },
    },
    start() {
      if (stopWatching) return;
      mkdirSync(dir, { recursive: true });
      reportErrors();
      stopWatching = watchFolders([dir], reload, { debounceMs, watch });
      scheduler.start();
      logger.log(`Routines: ${loaded.items.length} loaded, ${loaded.items.filter(isEnabled).length} enabled`);
    },
    stop() {
      stopWatching?.();
      stopWatching = undefined;
      scheduler.stop();
    },
  };
}
