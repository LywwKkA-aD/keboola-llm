import type { ApprovalRequest, Envelope } from '../api/types.ts';
import { trimArgs, trimText } from './feed-detail.ts';
import { pushSignal, type Signal } from './signals.ts';

export type FeedKind = 'delegate' | 'tool' | 'approval' | 'auto' | 'error';

export interface FeedItem {
  readonly id: string;
  readonly threadId: string;
  readonly at: number;
  readonly kind: FeedKind;
  /** Who acted; empty when the event does not say. */
  readonly agent: string;
  /** Delegated-to agent or tool name. */
  readonly target: string;
  readonly text: string;
  /** Matches the end of a tool call or a delegation to its start. */
  readonly callId?: string;
  /** Tool or request arguments ({ task } for a delegation), long strings cut. */
  readonly args?: Readonly<Record<string, unknown>>;
  /** How it ended: the tool's result preview, or the delegate's answer. Absent while it runs. */
  readonly result?: { readonly ok: boolean; readonly preview: string };
  /** A delegate's latest answer, until the delegation ends. */
  readonly outcome?: string;
  /** The approval to answer. */
  readonly interruptId?: string;
}

/** What is happening across all chats, for the top bar and the home overview. */
export interface LiveState {
  readonly running: readonly string[];
  readonly waiting: readonly string[];
  /** Newest first. */
  readonly feed: readonly FeedItem[];
  /** Bumped on every model call's usage: refetch the usage report. */
  readonly usageVersion: number;
  /** Bumped whenever the list of pending approvals may have changed: refetch it. */
  readonly approvalsVersion: number;
  /** Bumped when agents or skills changed on disk: refetch the team. */
  readonly teamVersion: number;
  /** Approvals asked and runs ended, oldest first: what desktop notifications announce. */
  readonly signals: readonly Signal[];
}

const FEED_LIMIT = 80;

export const initialLive = (): LiveState => ({
  running: [],
  waiting: [],
  feed: [],
  usageVersion: 0,
  approvalsVersion: 0,
  teamVersion: 0,
  signals: [],
});

const without = (list: readonly string[], id: string) => list.filter((entry) => entry !== id);
const withId = (list: readonly string[], id: string) => [...without(list, id), id];

const hintOf = (args: Readonly<Record<string, unknown>>) => {
  const hint = [args.purpose, args.file_path, args.path, args.pattern].find((value) => typeof value === 'string');
  return typeof hint === 'string' ? hint : '';
};

function pushFeed(state: LiveState, items: readonly FeedItem[]): LiveState {
  return { ...state, feed: [...items.toReversed(), ...state.feed].slice(0, FEED_LIMIT) };
}

function requestItems(kind: 'approval' | 'auto', requests: readonly ApprovalRequest[], base: Pick<FeedItem, 'threadId' | 'at' | 'interruptId'>, seq: number) {
  return requests.map(
    (request, index): FeedItem => ({
      ...base,
      id: `${seq}-${index}`,
      kind,
      agent: request.agent ?? '',
      target: request.tool,
      text: hintOf(request.args),
      args: trimArgs(request.args),
    }),
  );
}

/** Change the newest feed item of a chat that `match` picks; the same state when there is none. */
function updateItem(state: LiveState, threadId: string, match: (item: FeedItem) => boolean, change: (item: FeedItem) => FeedItem): LiveState {
  const index = state.feed.findIndex((item) => item.threadId === threadId && match(item));
  const found = state.feed[index];
  return found ? { ...state, feed: state.feed.with(index, change(found)) } : state;
}

/** Fold one server event (any chat) into the live summary. Pure. */
export function reduceLive(state: LiveState, envelope: Envelope, at: number): LiveState {
  const next = reduceEvent(state, envelope, at);
  const signals = pushSignal(state.signals, envelope);
  return signals === state.signals ? next : { ...next, signals };
}

function reduceEvent(state: LiveState, { seq, threadId, event }: Envelope, at: number): LiveState {
  const base = { threadId, at };
  const item = (kind: FeedKind, agent: string, target: string, text: string): FeedItem => ({ ...base, id: String(seq), kind, agent, target, text });
  switch (event.type) {
    case 'run.started':
      return { ...state, running: withId(state.running, threadId), waiting: without(state.waiting, threadId), approvalsVersion: state.approvalsVersion + 1 };
    case 'run.waiting':
      return { ...state, running: without(state.running, threadId), waiting: withId(state.waiting, threadId), approvalsVersion: state.approvalsVersion + 1 };
    case 'run.finished':
      return { ...state, running: without(state.running, threadId), waiting: without(state.waiting, threadId) };
    case 'run.failed':
      return pushFeed({ ...state, running: without(state.running, threadId), waiting: without(state.waiting, threadId) }, [item('error', '', '', event.error)]);
    case 'delegate.start':
      return pushFeed(state, [{ ...item('delegate', event.agent, event.to, event.task), callId: event.callId, args: { task: trimText(event.task) } }]);
    case 'message':
      // The delegate's own answer becomes the outcome of the delegation it is working on.
      return updateItem(
        state,
        threadId,
        (entry) => entry.kind === 'delegate' && entry.target === event.agent && !entry.result,
        (entry) => ({ ...entry, outcome: trimText(event.text) }),
      );
    case 'delegate.end':
      return updateItem(
        state,
        threadId,
        (entry) => entry.kind === 'delegate' && entry.callId === event.callId,
        ({ outcome, ...entry }) => ({ ...entry, result: { ok: event.ok, preview: outcome ?? '' } }),
      );
    case 'tool.start':
      return pushFeed(state, [{ ...item('tool', event.agent, event.tool, hintOf(event.args)), callId: event.callId, args: trimArgs(event.args) }]);
    case 'tool.end':
      return updateItem(
        state,
        threadId,
        (entry) => entry.kind === 'tool' && entry.callId === event.callId,
        (entry) => ({ ...entry, result: { ok: event.ok, preview: trimText(event.preview) } }),
      );
    case 'approval.required':
      return {
        ...pushFeed(state, requestItems('approval', event.requests, { ...base, interruptId: event.interruptId }, seq)),
        approvalsVersion: state.approvalsVersion + 1,
      };
    case 'approval.auto':
      return pushFeed(state, requestItems('auto', event.requests, base, seq));
    case 'usage':
      return { ...state, usageVersion: state.usageVersion + 1 };
    case 'team.updated':
      return { ...state, teamVersion: state.teamVersion + 1 };
    default:
      return state;
  }
}

/**
 * The feed rebuilt from the server's recent activity (after a page reload), behind what the live stream already
 * brought. Only the feed: running chats, approvals and notifications stay as the live stream has them. Pure.
 */
export function seedFeed(state: LiveState, envelopes: readonly Envelope[]): LiveState {
  const replayed = envelopes.reduce((current, envelope) => reduceEvent(current, envelope, envelope.at ?? 0), initialLive());
  const known = new Set(state.feed.map((item) => item.id));
  return { ...state, feed: [...state.feed, ...replayed.feed.filter((item) => !known.has(item.id))].slice(0, FEED_LIMIT) };
}
