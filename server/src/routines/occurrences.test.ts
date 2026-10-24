import { describe, expect, it } from 'vitest';
import { parseCron } from './cron.ts';
import { latestRun, nextRun } from './occurrences.ts';

const at = (iso: string) => Date.parse(iso);
const iso = (instant: number | undefined) => (instant === undefined ? undefined : new Date(instant).toISOString());

describe('nextRun', () => {
  it('finds the next weekday morning in the routine zone, across a weekend and a DST change', () => {
    const weekdays = parseCron('0 8 * * 1-5');
    // Friday 09:00 in Prague (summer time), next run Monday 08:00 in winter time.
    expect(iso(nextRun(weekdays, at('2026-10-23T07:00:00Z'), 'Europe/Prague'))).toBe('2026-10-26T07:00:00.000Z');
    expect(iso(nextRun(weekdays, at('2026-10-21T05:59:00Z'), 'Europe/Prague'))).toBe('2026-10-21T06:00:00.000Z');
  });

  it('is strictly after the given instant', () => {
    const mondays = parseCron('0 7 * * 1');
    expect(iso(nextRun(mondays, at('2026-10-26T07:00:00Z'), 'UTC'))).toBe('2026-11-02T07:00:00.000Z');
    expect(iso(nextRun(mondays, at('2026-10-26T06:59:59.999Z'), 'UTC'))).toBe('2026-10-26T07:00:00.000Z');
  });

  it('handles zones with half-hour offsets and the US DST change day', () => {
    expect(iso(nextRun(parseCron('0 9 * * *'), at('2026-10-24T00:00:00Z'), 'Asia/Kolkata'))).toBe('2026-10-24T03:30:00.000Z');
    // New York falls back on 2026-11-01: 08:00 that day is already EST.
    expect(iso(nextRun(parseCron('0 8 * * *'), at('2026-10-31T13:00:00Z'), 'America/New_York'))).toBe('2026-11-01T13:00:00.000Z');
  });

  it('skips a time that does not exist when clocks spring forward', () => {
    // Prague jumps from 02:00 to 03:00 on 2026-03-29.
    const cron = parseCron('30 2 * * *');
    expect(iso(nextRun(cron, at('2026-03-28T12:00:00Z'), 'Europe/Prague'))).toBe('2026-03-30T00:30:00.000Z');
  });

  it('runs a repeated time once, at its first occurrence, when clocks fall back', () => {
    // Prague repeats 02:00-03:00 on 2026-10-25: 02:30 is 00:30Z (summer time) and again 01:30Z.
    const cron = parseCron('30 2 * * *');
    const first = nextRun(cron, at('2026-10-24T12:00:00Z'), 'Europe/Prague');
    expect(iso(first)).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(nextRun(cron, first ?? 0, 'Europe/Prague'))).toBe('2026-10-26T01:30:00.000Z');
  });

  it('looks years ahead for February 29', () => {
    expect(iso(nextRun(parseCron('0 0 29 2 *'), at('2026-03-01T00:00:00Z'), 'UTC'))).toBe('2028-02-29T00:00:00.000Z');
  });

  it('matches either day field when both are given', () => {
    // The 1st of the month or any Monday.
    const cron = parseCron('0 6 1 * 1');
    expect(iso(nextRun(cron, at('2026-10-27T00:00:00Z'), 'UTC'))).toBe('2026-11-01T06:00:00.000Z');
    expect(iso(nextRun(cron, at('2026-11-01T06:00:00Z'), 'UTC'))).toBe('2026-11-02T06:00:00.000Z');
  });
});

describe('latestRun', () => {
  const weekdays = parseCron('0 8 * * 1-5');

  it('returns the latest run inside (after, until]', () => {
    expect(iso(latestRun(weekdays, 'Europe/Prague', { after: at('2026-10-26T06:00:00Z'), until: at('2026-10-26T09:00:00Z') }))).toBe(
      '2026-10-26T07:00:00.000Z',
    );
    expect(iso(latestRun(weekdays, 'Europe/Prague', { after: at('2026-10-26T06:00:00Z'), until: at('2026-10-26T07:00:00Z') }))).toBe(
      '2026-10-26T07:00:00.000Z',
    );
  });

  it('excludes the start of the window and finds nothing in an empty one', () => {
    expect(latestRun(weekdays, 'Europe/Prague', { after: at('2026-10-26T07:00:00Z'), until: at('2026-10-26T09:00:00Z') })).toBeUndefined();
    expect(latestRun(weekdays, 'Europe/Prague', { after: at('2026-10-24T00:00:00Z'), until: at('2026-10-25T23:00:00Z') })).toBeUndefined();
    expect(latestRun(weekdays, 'UTC', { after: at('2026-10-26T09:00:00Z'), until: at('2026-10-26T08:00:00Z') })).toBeUndefined();
  });

  it('picks only the last of several runs', () => {
    const quarterly = parseCron('*/15 * * * *');
    expect(iso(latestRun(quarterly, 'UTC', { after: at('2026-10-26T10:00:00Z'), until: at('2026-10-26T10:50:00Z') }))).toBe(
      '2026-10-26T10:45:00.000Z',
    );
  });

  it('reaches back across days', () => {
    expect(iso(latestRun(weekdays, 'UTC', { after: at('2026-10-20T00:00:00Z'), until: at('2026-10-25T12:00:00Z') }))).toBe(
      '2026-10-23T08:00:00.000Z',
    );
  });
});
