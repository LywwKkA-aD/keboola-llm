import type { BusEvent, Envelope, EventBus } from './bus.ts';

/** What the agent cards and the activity feed show; tokens, usage and run bookkeeping are left out. */
const KEPT: ReadonlySet<BusEvent['type']> = new Set([
  'tool.start',
  'tool.end',
  'delegate.start',
  'delegate.end',
  'message',
  'approval.required',
  'approval.auto',
  'run.failed',
]);

/** Fields that carry content (and can be long); names, ids and types stay as they are. */
const CONTENT = new Set(['args', 'preview', 'text', 'task', 'error', 'requests']);

export interface ActivityLog {
  /** The newest entries, oldest first. */
  list(): readonly Envelope[];
}

function trim(value: unknown, maxText: number, depth = 0): unknown {
  if (typeof value === 'string') return value.length > maxText ? `${value.slice(0, maxText)}…` : value;
  if (depth >= 6) return Array.isArray(value) || (value && typeof value === 'object') ? '…' : value;
  if (Array.isArray(value)) return value.slice(0, 200).map((entry) => trim(entry, maxText, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, trim(entry, maxText, depth + 1)]));
  return value;
}

/**
 * The last things the team did in any chat, so a reloaded page can show an agent's recent actions (the live stream
 * only carries what happens after it connects). In memory: a restart starts empty, like the runs themselves.
 */
export function createActivityLog(bus: EventBus, { limit = 300, maxText = 6000 }: { limit?: number; maxText?: number } = {}): ActivityLog {
  let entries: readonly Envelope[] = [];
  bus.subscribe((envelope) => {
    if (!KEPT.has(envelope.event.type)) return;
    const event = Object.fromEntries(Object.entries(envelope.event).map(([key, value]) => [key, CONTENT.has(key) ? trim(value, maxText) : value]));
    entries = [...entries, { ...envelope, event: event as BusEvent }].slice(-limit);
  });
  return { list: () => entries };
}
