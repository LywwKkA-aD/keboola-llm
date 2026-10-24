/** Helpers that keep the details of a feed item (arguments, results) small enough to hold 80 of them. */

/** Longest string kept: enough for a diff, a query or a result preview, not a whole file or table. */
export const MAX_TEXT = 6000;
/** Longest list kept, and how deep nested arguments are followed. */
const MAX_ITEMS = 200;
const MAX_DEPTH = 5;

export const trimText = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text);

function trimValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return trimText(value);
  if (depth >= MAX_DEPTH) return Array.isArray(value) || (value && typeof value === 'object') ? '…' : value;
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((entry) => trimValue(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, trimValue(entry, depth + 1)]));
  }
  return value;
}

/** A copy of tool arguments with long strings cut and deep structures folded. */
export const trimArgs = (args: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  trimValue(args, 0) as Readonly<Record<string, unknown>>;
