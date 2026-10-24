import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../api/bus.ts';
import { createUsageStore, localDate, trackUsage } from './store.ts';

const dirs: string[] = [];
const fileIn = () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-'));
  dirs.push(dir);
  return join(dir, 'usage.json');
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const sample = { agent: 'lead', input: 100, cached: 80, cacheWrite: 0, output: 10 };

describe('usage store', () => {
  it('keeps usage across restarts', () => {
    const file = fileIn();
    createUsageStore({ file, today: () => '2026-10-24' }).record(sample);
    const reopened = createUsageStore({ file, today: () => '2026-10-24' });
    expect(reopened.report().today).toEqual({ calls: 1, input: 100, cached: 80, cacheWrite: 0, output: 10 });
  });

  it('starts empty from a missing or broken file', () => {
    const file = fileIn();
    expect(createUsageStore({ file }).report().total.calls).toBe(0);
    writeFileSync(file, '{"2026-10-24": {"totals": "nope"}}');
    expect(createUsageStore({ file }).report().total.calls).toBe(0);
  });

  it('forgets days older than the kept window when it writes', () => {
    const file = fileIn();
    let today = '2026-01-01';
    const store = createUsageStore({ file, today: () => today, keepDays: 30 });
    store.record(sample);
    today = '2026-03-01';
    store.record(sample);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['2026-03-01']);
  });

  it('records the usage events of every chat from the bus', () => {
    const bus = createEventBus({ historyPerThread: 10 });
    const store = createUsageStore({ file: fileIn(), today: () => '2026-10-24' });
    trackUsage(bus, store);
    bus.publish('t1', { type: 'usage', ...sample });
    bus.publish('t2', { type: 'usage', ...sample, agent: 'scout' });
    bus.publish('t1', { type: 'message', agent: 'lead', text: 'hi' });
    expect(store.report().today.calls).toBe(2);
    expect(store.report().agents.map((entry) => entry.agent).toSorted()).toEqual(['lead', 'scout']);
  });

  it('dates usage by the local calendar day', () => {
    expect(localDate(new Date(2026, 9, 24, 23, 59))).toBe('2026-10-24');
    expect(localDate(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });
});
