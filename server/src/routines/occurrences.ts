import { type Cron, matchesDay } from './cron.ts';
import { offsetAt, wallTime } from './zone.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** How far ahead nextRun looks: eight years cover a February 29 schedule. */
const MAX_DAYS = 8 * 366;

/** The calendar day an instant falls on in a zone, as UTC midnight of that date: days are counted on this scale. */
function wallDayOf(instant: number, timeZone: string): number {
  const { year, month, day } = wallTime(instant, timeZone);
  return Date.UTC(year, month - 1, day);
}

/**
 * The instants cron fires at on one local calendar day, ascending. On a DST change day a time that does
 * not exist is skipped and a time that happens twice fires once, at its first occurrence.
 */
function runsOn(cron: Cron, wallDay: number, timeZone: string): number[] {
  const date = new Date(wallDay);
  if (!matchesDay(cron, { month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() })) return [];
  const walls = cron.hours.flatMap((hour) => cron.minutes.map((minute) => wallDay + hour * HOUR_MS + minute * MINUTE_MS));
  // Every instant of the local day lies within these bounds (UTC offsets span -12 h to +14 h).
  const before = offsetAt(wallDay - 14 * HOUR_MS, timeZone);
  const after = offsetAt(wallDay + 36 * HOUR_MS, timeZone);
  if (before === after) return walls.map((wall) => wall - before);
  return walls
    .flatMap((wall) => {
      const valid = [before, after].filter((offset) => offsetAt(wall - offset, timeZone) === offset).map((offset) => wall - offset);
      return valid.length > 0 ? [Math.min(...valid)] : [];
    })
    .toSorted((a, b) => a - b);
}

/** The first time cron fires strictly after `after` (epoch ms), in the given zone. */
export function nextRun(cron: Cron, after: number, timeZone: string): number | undefined {
  const first = wallDayOf(after, timeZone) - DAY_MS;
  for (let index = 0; index <= MAX_DAYS; index += 1) {
    const found = runsOn(cron, first + index * DAY_MS, timeZone).find((instant) => instant > after);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The last time cron fired in (after, until], if any. Meant for short windows (the scheduler looks back 12 h). */
export function latestRun(cron: Cron, timeZone: string, { after, until }: { after: number; until: number }): number | undefined {
  if (after >= until) return undefined;
  const first = wallDayOf(after, timeZone) - DAY_MS;
  for (let day = wallDayOf(until, timeZone) + DAY_MS; day >= first; day -= DAY_MS) {
    const found = runsOn(cron, day, timeZone)
      .filter((instant) => instant > after && instant <= until)
      .at(-1);
    if (found !== undefined) return found;
  }
  return undefined;
}
