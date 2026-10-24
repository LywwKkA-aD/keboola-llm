import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createRoutineStateStore } from './state-store.ts';

const RUN = { at: '2026-10-26T07:00:00.000Z', threadId: 't1' };

describe('createRoutineStateStore', () => {
  it('keeps overrides and runs on disk across restarts', () => {
    const file = join(makeTree({}), 'data', 'routines.json');
    const store = createRoutineStateStore(file);
    expect(store.get('morning-check')).toEqual({});

    const next = store.update('morning-check', (state) => ({ ...state, enabled: true, lastRun: RUN }));
    expect(next).toEqual({ enabled: true, lastRun: RUN });
    store.update('profile-refresh', () => ({ enabled: false, settledUntil: '2026-10-26T06:00:00.000Z' }));

    const reopened = createRoutineStateStore(file);
    expect(reopened.get('morning-check')).toEqual({ enabled: true, lastRun: RUN });
    expect(reopened.get('profile-refresh')).toEqual({ enabled: false, settledUntil: '2026-10-26T06:00:00.000Z' });
    // Written atomically: no temp file stays behind.
    expect(readdirSync(dirname(file))).toEqual(['routines.json']);
  });

  it('starts empty without a file or with a damaged one, and drops invalid entries', () => {
    const root = makeTree({});
    expect(createRoutineStateStore(join(root, 'none.json')).get('x')).toEqual({});

    const file = join(root, 'routines.json');
    writeFileSync(file, '{not json');
    expect(createRoutineStateStore(file).get('x')).toEqual({});

    writeFileSync(file, JSON.stringify({ good: { enabled: true }, bad: { enabled: 'yes' }, list: [], run: { lastRun: { at: 'x' } } }));
    const store = createRoutineStateStore(file);
    expect(store.get('good')).toEqual({ enabled: true });
    expect(store.get('bad')).toEqual({});
    expect(store.get('run')).toEqual({});
  });

  it('does not write when nothing changes', () => {
    const file = join(makeTree({}), 'routines.json');
    const store = createRoutineStateStore(file);
    store.update('x', (state) => state);
    expect(existsSync(file)).toBe(false);

    store.update('x', () => ({ enabled: true }));
    writeFileSync(file, '{}');
    store.update('x', () => ({ enabled: true }));
    expect(readFileSync(file, 'utf8')).toBe('{}');
  });
});
