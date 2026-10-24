import { join } from 'node:path';
import { createEventBus } from '../api/bus.ts';
import { allowedFor } from '../api/guard.ts';
import type { RunManager } from '../api/runs.ts';
import { createThreadStore } from '../api/threads.ts';
import type { ServerDeps } from '../api/types.ts';
import { DEFAULT_SETTINGS } from '../config/settings.ts';
import { createNoteStore } from '../knowledge/store.ts';
import { makeTree } from './tree.ts';

/** Host header the guard accepts in tests (the default port). */
export const TEST_HOST = { host: '127.0.0.1:4800' };

const idleRuns: RunManager = {
  start: () => ({ runId: 'run', done: Promise.resolve() }),
  answer: () => ({ runId: 'run', done: Promise.resolve() }),
  resume: () => ({ runId: 'run', done: Promise.resolve() }),
  pending: () => [],
  isBusy: () => false,
  cancel: () => false,
  active: () => [],
  waitingThreads: () => [],
  resumable: () => [],
  discard: () => {},
};

/** Idle runs with some methods replaced, for route tests. */
export const runsWith = (overrides: Partial<RunManager>): RunManager => ({ ...idleRuns, ...overrides });

/** Complete ServerDeps for route tests: idle runs, empty temp folders, nothing reachable upstream. */
export function testDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  const dir = makeTree({});
  return {
    bus: createEventBus({ historyPerThread: 10 }),
    runs: idleRuns,
    threads: createThreadStore(join(dir, 'threads.json')),
    team: () => ({ lead: 'lead', agents: [], skills: [], warnings: [], loadErrors: [] }),
    settings: { get: () => DEFAULT_SETTINGS, set: () => DEFAULT_SETTINGS },
    history: async () => [],
    deleteThread: async () => {},
    allowed: allowedFor({ port: 4800, devPort: 5173 }),
    models: async () => [],
    keboolaProjects: async () => [],
    system: async () => {
      throw new Error('not in tests');
    },
    effective: () => ({ model: '', keboolaProject: '' }),
    onboarding: async () => ({ project: '', profiled: false }),
    version: '0.0.0',
    knowledge: createNoteStore(join(dir, 'knowledge')),
    memories: createNoteStore(join(dir, 'memories')),
    ...overrides,
  };
}
