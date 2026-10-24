import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createThreadStore } from '../api/threads.ts';
import type { RoutineDefinition } from '../registry/routines.ts';
import { makeTree } from '../test-utils/tree.ts';
import { parseCron } from './cron.ts';
import { createRoutineLauncher, routineMessage } from './launch.ts';

const ROUTINE: RoutineDefinition = {
  name: 'morning-check',
  title: 'Morning check',
  description: 'Weekday health check.',
  schedule: '0 8 * * 1-5',
  cron: parseCron('0 8 * * 1-5'),
  enabled: false,
  prompt: 'List the failed jobs since the previous working day.',
  file: 'routines/morning-check.md',
};

const MONDAY_8 = Date.parse('2026-10-26T07:00:00Z');

describe('routineMessage', () => {
  it('tells the lead which routine runs and when, then gives its text', () => {
    expect(routineMessage(ROUTINE, MONDAY_8, 'Europe/Prague')).toBe(
      'Scheduled routine "Morning check" (morning-check), started Monday 2026-10-26 08:00 Europe/Prague.\n\n' +
        'List the failed jobs since the previous working day.',
    );
  });
});

describe('createRoutineLauncher', () => {
  it('opens a chat titled "<title> · <date>" and starts the run with the message', () => {
    const threads = createThreadStore(join(makeTree({}), 'threads.json'));
    const started: [string, unknown][] = [];
    const launch = createRoutineLauncher({
      threads,
      runs: {
        start: (threadId, input) => {
          started.push([threadId, input]);
          return { runId: 'r1', done: Promise.resolve() };
        },
      },
    });

    const threadId = launch(ROUTINE, MONDAY_8, 'Europe/Prague');

    expect(threads.get(threadId)?.title).toBe('Morning check · 2026-10-26');
    expect(started).toEqual([[threadId, { messages: [{ role: 'user', content: routineMessage(ROUTINE, MONDAY_8, 'Europe/Prague') }] }]]);
  });

  it('removes the chat again when the run cannot start', () => {
    const threads = createThreadStore(join(makeTree({}), 'threads.json'));
    const launch = createRoutineLauncher({
      threads,
      runs: {
        start: () => {
          throw new Error('busy');
        },
      },
    });

    expect(() => launch(ROUTINE, MONDAY_8, 'UTC')).toThrow('busy');
    expect(threads.list()).toEqual([]);
  });
});
