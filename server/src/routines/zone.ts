/** Wall-clock fields of an instant in a time zone. */
export interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Building a formatter is slow; the scheduler asks the same few zones over and over.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  formatters.set(timeZone, created);
  return created;
}

/** Whether Intl knows the zone, e.g. "Europe/Prague" or "UTC". */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    return Boolean(timeZone) && Boolean(formatter(timeZone));
  } catch {
    return false;
  }
}

/** The machine's zone (honours TZ), UTC when it cannot be told. */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function wallTime(instant: number, timeZone: string): WallTime {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((part) => [part.type, Number(part.value)]));
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms (Prague in winter: one hour). */
export function offsetAt(instant: number, timeZone: string): number {
  const wall = wallTime(instant, timeZone);
  const wholeSeconds = Math.floor(instant / 1000) * 1000;
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - wholeSeconds;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local date ("2026-10-26"), time ("08:05") and English weekday of an instant, for chat titles and prompts. */
export function stampOf(instant: number, timeZone: string): { readonly date: string; readonly time: string; readonly weekday: string } {
  const { year, month, day, hour, minute } = wallTime(instant, timeZone);
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '',
  };
}
