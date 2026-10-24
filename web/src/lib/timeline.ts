import type { ChatEntry } from '../api/types.ts';
import type { Activity } from '../state/run-state.ts';

export type TimelineItem =
  | { readonly kind: 'entry'; readonly entry: ChatEntry }
  | { readonly kind: 'steps'; readonly turn: number; readonly steps: readonly Activity[] };

/**
 * The chat in the order things happened: each turn's steps right after the user message that started it, before
 * the reply. Turns are matched to user messages from the end, because the event stream may have missed older turns
 * (e.g. after a server restart); a turn whose message is not in the history yet goes last.
 */
export function timeline(history: readonly ChatEntry[], activities: readonly Activity[], turns: number): TimelineItem[] {
  const userAt = history.flatMap((entry, index) => (entry.role === 'user' ? [index] : []));
  const byTurn = activities.reduce<ReadonlyMap<number, readonly Activity[]>>(
    (groups, activity) => new Map(groups).set(activity.turn, [...(groups.get(activity.turn) ?? []), activity]),
    new Map(),
  );
  const groups = [...byTurn.entries()].toSorted(([a], [b]) => a - b).map(([turn, steps]) => ({ turn, steps, at: userAt[userAt.length - (turns - turn)] }));
  const stepsAfter = (index: number): TimelineItem[] =>
    groups.filter((group) => group.at === index).map(({ turn, steps }) => ({ kind: 'steps', turn, steps }));
  return [
    ...history.flatMap((entry, index): TimelineItem[] => [{ kind: 'entry', entry }, ...stepsAfter(index)]),
    ...groups.filter((group) => group.at === undefined).map(({ turn, steps }): TimelineItem => ({ kind: 'steps', turn, steps })),
  ];
}
