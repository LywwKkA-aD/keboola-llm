import { describe, expect, it } from 'vitest';
import { matchesDay, parseCron } from './cron.ts';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('parseCron', () => {
  it('reads single values, lists, ranges and steps', () => {
    const cron = parseCron('0,30 8-10 1,15 */3 1-5');
    expect(cron.minutes).toEqual([0, 30]);
    expect(cron.hours).toEqual([8, 9, 10]);
    expect(cron.days).toEqual([1, 15]);
    expect(cron.months).toEqual([1, 4, 7, 10]);
    expect(cron.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(cron.source).toBe('0,30 8-10 1,15 */3 1-5');
  });

  it('expands stars to the whole field', () => {
    const cron = parseCron('* * * * *');
    expect(cron.minutes).toEqual(range(0, 59));
    expect(cron.hours).toEqual(range(0, 23));
    expect(cron.days).toEqual(range(1, 31));
    expect(cron.months).toEqual(range(1, 12));
    expect(cron.weekdays).toEqual(range(0, 6));
    expect(cron.daysRestricted).toBe(false);
    expect(cron.weekdaysRestricted).toBe(false);
  });

  it('supports stepped ranges and a start with a step', () => {
    expect(parseCron('10-40/15 * * * *').minutes).toEqual([10, 25, 40]);
    expect(parseCron('50/5 * * * *').minutes).toEqual([50, 55]);
    expect(parseCron('*/20 * * * *').minutes).toEqual([0, 20, 40]);
  });

  it('accepts month and weekday names in any case, and 7 as Sunday', () => {
    expect(parseCron('0 9 * jan,JUL *').months).toEqual([1, 7]);
    expect(parseCron('0 9 * * Mon-Fri').weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('0 9 * * 7').weekdays).toEqual([0]);
    expect(parseCron('0 9 * * 5-7').weekdays).toEqual([0, 5, 6]);
    expect(parseCron('0 9 * * SUN,sat').weekdays).toEqual([0, 6]);
  });

  it('tolerates extra whitespace and dedupes overlapping parts', () => {
    expect(parseCron('  0   8  * *   1-5  ').source).toBe('0 8 * * 1-5');
    expect(parseCron('0,0,1-2,2 * * * *').minutes).toEqual([0, 1, 2]);
  });

  it('marks a day field restricted unless it starts with a star', () => {
    expect(parseCron('0 0 1 * *').daysRestricted).toBe(true);
    expect(parseCron('0 0 */2 * *').daysRestricted).toBe(false);
    expect(parseCron('0 0 * * 1').weekdaysRestricted).toBe(true);
  });

  it.each([
    ['', /5 fields/],
    ['0 8 * *', /5 fields/],
    ['0 8 * * * *', /5 fields/],
    ['60 * * * *', /minute.*0-59/],
    ['* 24 * * *', /hour.*0-23/],
    ['* * 0 * *', /day of month.*1-31/],
    ['* * * 13 *', /month.*1-12/],
    ['* * * * 8', /day of week.*0-7/],
    ['5-1 * * * *', /minute/],
    ['*/0 * * * *', /step/],
    ['a * * * *', /minute/],
    ['1,,2 * * * *', /minute/],
    ['* * * * mon-', /day of week/],
    ['* * * foo *', /month/],
    ['@daily', /5 fields/],
  ])('rejects %j', (expression, message) => {
    expect(() => parseCron(expression)).toThrow(message);
  });

  it('rejects schedules that can never fire', () => {
    expect(() => parseCron('0 0 30 2 *')).toThrow(/never/);
    expect(() => parseCron('0 0 31 4,6,9,11 *')).toThrow(/never/);
    // February 29 does come round, and with a weekday too the day fields match either one.
    expect(parseCron('0 0 29 2 *').days).toEqual([29]);
    expect(parseCron('0 0 30 2 1').weekdays).toEqual([1]);
  });
});

describe('matchesDay', () => {
  it('requires both day fields when one of them is a star', () => {
    const weekdays = parseCron('0 8 * * 1-5');
    expect(matchesDay(weekdays, { month: 10, day: 27, weekday: 1 })).toBe(true);
    expect(matchesDay(weekdays, { month: 10, day: 25, weekday: 6 })).toBe(false);

    const firstOfMonth = parseCron('0 8 1 * *');
    expect(matchesDay(firstOfMonth, { month: 11, day: 1, weekday: 6 })).toBe(true);
    expect(matchesDay(firstOfMonth, { month: 11, day: 2, weekday: 0 })).toBe(false);
  });

  it('matches either day field when both are restricted, like Vixie cron', () => {
    const cron = parseCron('0 8 1 * 1');
    expect(matchesDay(cron, { month: 11, day: 1, weekday: 6 })).toBe(true);
    expect(matchesDay(cron, { month: 11, day: 3, weekday: 1 })).toBe(true);
    expect(matchesDay(cron, { month: 11, day: 4, weekday: 2 })).toBe(false);
  });

  it('checks the month', () => {
    const cron = parseCron('0 8 * 1 *');
    expect(matchesDay(cron, { month: 1, day: 5, weekday: 1 })).toBe(true);
    expect(matchesDay(cron, { month: 2, day: 5, weekday: 4 })).toBe(false);
  });
});
