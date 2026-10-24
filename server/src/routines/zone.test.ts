import { describe, expect, it } from 'vitest';
import { isValidTimeZone, offsetAt, stampOf, systemTimeZone, wallTime } from './zone.ts';

const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

describe('time zones', () => {
  it('reads the wall clock of an instant in a zone', () => {
    expect(wallTime(at('2026-10-26T07:00:00Z'), 'Europe/Prague')).toEqual({ year: 2026, month: 10, day: 26, hour: 8, minute: 0, second: 0 });
    expect(wallTime(at('2026-07-01T23:30:15Z'), 'Asia/Kolkata')).toEqual({ year: 2026, month: 7, day: 2, hour: 5, minute: 0, second: 15 });
    expect(wallTime(at('2026-01-01T00:00:00Z'), 'UTC').hour).toBe(0);
  });

  it('knows the offset on both sides of a DST change', () => {
    expect(offsetAt(at('2026-10-24T12:00:00Z'), 'Europe/Prague')).toBe(2 * HOUR);
    expect(offsetAt(at('2026-10-26T12:00:00Z'), 'Europe/Prague')).toBe(HOUR);
    expect(offsetAt(at('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-4 * HOUR);
    expect(offsetAt(at('2026-07-01T12:00:00.999Z'), 'Asia/Kolkata')).toBe(5.5 * HOUR);
  });

  it('accepts IANA zones and rejects anything else', () => {
    expect(isValidTimeZone('Europe/Prague')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('names the machine zone', () => {
    expect(isValidTimeZone(systemTimeZone())).toBe(true);
  });

  it('stamps an instant with its local date, time and weekday', () => {
    expect(stampOf(at('2026-10-26T07:05:00Z'), 'Europe/Prague')).toEqual({ date: '2026-10-26', time: '08:05', weekday: 'Monday' });
    expect(stampOf(at('2026-10-25T23:30:00Z'), 'America/New_York')).toEqual({ date: '2026-10-25', time: '19:30', weekday: 'Sunday' });
  });
});
