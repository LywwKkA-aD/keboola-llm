import { describe, expect, it } from 'vitest';
import type { Language } from '../api/types.ts';
import { translate } from '../i18n/strings.ts';
import { describeSchedule, formatWhen } from './schedule.ts';

const describeIn = (language: Language) => (cron: string) => describeSchedule(cron, language, (key) => translate(language, key));

describe('describeSchedule', () => {
  const en = describeIn('en');

  it('names common day patterns with the time', () => {
    expect(en('0 8 * * 1-5')).toBe('Weekdays · 08:00');
    expect(en('0 8 * * MON-FRI')).toBe('Weekdays · 08:00');
    expect(en('30 7 * * *')).toBe('Every day · 07:30');
    expect(en('0 9 * * 6,0')).toBe('Weekends · 09:00');
    expect(en('0 9 * * sat,7')).toBe('Weekends · 09:00');
  });

  it('lists single weekdays by their short local names, Monday first', () => {
    expect(en('0 7 * * 1')).toBe('Mon · 07:00');
    expect(en('0 7 * * 0,1,3')).toBe('Mon, Wed, Sun · 07:00');
    expect(describeIn('ru')('0 7 * * 1')).toBe('пн · 07:00');
    expect(describeIn('cs')('0 7 * * 1')).toBe('po · 07:00');
  });

  it('covers several times a day, monthly days, hourly and minute steps', () => {
    expect(en('0 8,14 * * 1-5')).toBe('Weekdays · 08:00, 14:00');
    expect(en('30 6 1 * *')).toBe('Monthly on day 1 · 06:30');
    expect(en('0 6 1,15 * *')).toBe('Monthly on day 1, 15 · 06:00');
    expect(en('15 * * * *')).toBe('Every hour at :15');
    expect(en('*/15 * * * *')).toBe('Every 15 min');
  });

  it('translates the words', () => {
    expect(describeIn('ru')('0 8 * * 1-5')).toBe('По будням · 08:00');
    expect(describeIn('cs')('0 8 * * *')).toBe('Každý den · 08:00');
  });

  it('falls back to the expression for anything else', () => {
    ['0 8 * 1 *', '*/5 8-17 * * 1-5', '0 */2 * * *', '0 1,2,3,4,5 * * *', '0 8 1 * 1', 'nonsense', '0 8 * * 5-1'].forEach((cron) => {
      expect(en(cron)).toBe(cron);
    });
  });
});

describe('formatWhen', () => {
  it('formats a time with the weekday in the given language and zone', () => {
    expect(formatWhen('2026-10-26T07:00:00Z', 'en', 'UTC')).toBe('Mon, Oct 26, 07:00');
    expect(formatWhen('2026-10-26T07:00:00Z', 'en', 'Europe/Prague')).toContain('08:00');
  });
});
