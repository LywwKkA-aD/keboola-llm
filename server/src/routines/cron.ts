/**
 * A 5-field cron expression (minute hour day-of-month month day-of-week), expanded to sorted value lists.
 * Supports `*`, values, `a-b` ranges, `/n` steps, comma lists and JAN-DEC / SUN-SAT names, like Vixie cron.
 */
export interface Cron {
  readonly source: string;
  readonly minutes: readonly number[];
  readonly hours: readonly number[];
  readonly days: readonly number[];
  readonly months: readonly number[];
  /** 0-6, Sunday is 0 (7 in the expression means Sunday too). */
  readonly weekdays: readonly number[];
  /** Day fields given explicitly (not starting with a star): when both are, a day matches either one. */
  readonly daysRestricted: boolean;
  readonly weekdaysRestricted: boolean;
}

/** A calendar day as cron sees it: month 1-12, day 1-31, weekday 0-6 (Sunday 0). */
export interface CronDay {
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

interface FieldSpec {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  /** Names for the values from `min` on, matched case-insensitively. */
  readonly names?: readonly string[];
}

const FIELDS: readonly FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] },
  { name: 'day of week', min: 0, max: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
];

/** Longest month lengths, February in a leap year. */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ITEM_RE = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/i;

const notAValue = (spec: FieldSpec, text: string) => new Error(`${spec.name}: "${text}" is not a value in ${spec.min}-${spec.max}`);

function parseValue(text: string, spec: FieldSpec): number {
  const named = spec.names?.indexOf(text.toLowerCase()) ?? -1;
  const value = named >= 0 ? spec.min + named : /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(value) || value < spec.min || value > spec.max) throw notAValue(spec, text);
  return value;
}

function parseItem(item: string, spec: FieldSpec): number[] {
  const match = ITEM_RE.exec(item);
  if (!match) throw notAValue(spec, item);
  const base = match[1] ?? '';
  const step = match[2] === undefined ? 1 : Number(match[2]);
  if (step < 1) throw new Error(`${spec.name}: step must be at least 1 in "${item}"`);

  const [from, to] = (() => {
    if (base === '*') return [spec.min, spec.max];
    const [start = '', end] = base.split('-');
    const first = parseValue(start, spec);
    // "a/n" means from a to the end of the field, every n.
    if (end === undefined) return [first, match[2] === undefined ? first : spec.max];
    const last = parseValue(end, spec);
    if (first > last) throw new Error(`${spec.name}: range "${base}" goes backwards`);
    return [first, last];
  })();
  return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);
}

function parseField(text: string, spec: FieldSpec): number[] {
  const values = text.split(',').flatMap((item) => parseItem(item, spec));
  // Day of week 7 is Sunday.
  const normalized = spec.name === 'day of week' ? values.map((value) => value % 7) : values;
  return [...new Set(normalized)].toSorted((a, b) => a - b);
}

/** Parse a 5-field cron expression. Throws an Error that says what is wrong. */
export function parseCron(expression: string): Cron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`expected 5 fields (minute hour day-of-month month day-of-week), got "${expression.trim()}"`);
  const [minutes = [], hours = [], days = [], months = [], weekdays = []] = fields.map((field, index) => parseField(field, FIELDS[index] as FieldSpec));
  const cron: Cron = {
    source: fields.join(' '),
    minutes,
    hours,
    days,
    months,
    weekdays,
    daysRestricted: !fields[2]?.startsWith('*'),
    weekdaysRestricted: !fields[4]?.startsWith('*'),
  };
  const dayExists = months.some((month) => days.some((day) => day <= (MONTH_DAYS[month - 1] ?? 0)));
  if (cron.daysRestricted && !cron.weekdaysRestricted && !dayExists) {
    throw new Error(`"${cron.source}" never fires: none of its months has those days`);
  }
  return cron;
}

/** Whether cron runs on this calendar day (time of day aside). */
export function matchesDay(cron: Cron, { month, day, weekday }: CronDay): boolean {
  if (!cron.months.includes(month)) return false;
  const byDay = cron.days.includes(day);
  const byWeekday = cron.weekdays.includes(weekday);
  return cron.daysRestricted && cron.weekdaysRestricted ? byDay || byWeekday : byDay && byWeekday;
}
