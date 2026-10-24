import type { Language } from '../api/types.ts';
import type { StringKey } from '../i18n/strings.ts';

type Translate = (key: StringKey) => string;

const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX_TIMES = 4;

const pad = (value: number) => String(value).padStart(2, '0');
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Values of a plain cron field (numbers, names, ranges, lists); undefined for stars, steps or anything odd. */
function valuesOf(field: string, names: readonly string[] = []): number[] | undefined {
  if (!/^[\w,-]+$/.test(field)) return undefined;
  const value = (text: string) => {
    const named = names.indexOf(text.toLowerCase());
    return named >= 0 ? named : /^\d+$/.test(text) ? Number(text) : Number.NaN;
  };
  const values = field.split(',').flatMap((part) => {
    const [start = '', end] = part.split('-');
    const from = value(start);
    const to = end === undefined ? from : value(end);
    return Number.isNaN(from) || Number.isNaN(to) || to < from ? [Number.NaN] : Array.from({ length: to - from + 1 }, (_, index) => from + index);
  });
  return values.some(Number.isNaN) ? undefined : [...new Set(values)].toSorted((a, b) => a - b);
}

/** Weekdays Monday first, Sunday (0 or 7) last. */
function weekdaysOf(field: string): number[] | undefined {
  const values = valuesOf(field, WEEKDAY_NAMES);
  return values && [...new Set(values.map((day) => day % 7))].toSorted((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

const shortWeekday = (day: number, language: Language) =>
  // 2023-01-01 was a Sunday.
  new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));

function daysText(day: string, weekday: string, language: Language, t: Translate): string | undefined {
  if (day === '*' && weekday === '*') return t('schedule.daily');
  if (day === '*') {
    const weekdays = weekdaysOf(weekday);
    if (!weekdays) return undefined;
    if (same(weekdays, [1, 2, 3, 4, 5])) return t('schedule.weekdays');
    if (same(weekdays, [6, 0])) return t('schedule.weekends');
    return weekdays.map((value) => shortWeekday(value, language)).join(', ');
  }
  const days = weekday === '*' ? valuesOf(day) : undefined;
  return days && t('schedule.monthly').replace('{days}', days.join(', '));
}

/**
 * A cron expression in words for the common shapes ("Weekdays · 08:00", "Mon · 07:00", "Every 15 min");
 * anything else comes back as the expression itself.
 */
export function describeSchedule(cron: string, language: Language, t: Translate): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return cron;
  const [minute = '', hour = '', day = '', month = '', weekday = ''] = fields;
  const restEvery = day === '*' && month === '*' && weekday === '*';

  const step = /^\*\/(\d+)$/.exec(minute);
  if (step && hour === '*' && restEvery) return t('schedule.everyMinutes').replace('{n}', step[1] ?? '');
  const minutes = valuesOf(minute);
  if (minutes?.length !== 1) return cron;
  const at = pad(minutes[0] ?? 0);
  if (hour === '*' && restEvery) return t('schedule.hourly').replace('{minute}', at);

  const hours = valuesOf(hour);
  if (!hours || hours.length > MAX_TIMES || month !== '*') return cron;
  const days = daysText(day, weekday, language, t);
  return days ? `${days} · ${hours.map((value) => `${pad(value)}:${at}`).join(', ')}` : cron;
}

/** "Mon, Oct 26, 08:00" in the user's language, in the browser's zone unless one is given. */
export function formatWhen(iso: string, language: Language, timeZone?: string): string {
  return new Date(iso).toLocaleString(language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  });
}

/** The zone the browser shows times in; routines in another zone say which one they use. */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
