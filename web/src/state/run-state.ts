import type { ApprovalRequest, BusEvent } from '../api/types.ts';

export type RunStatus = 'idle' | 'running' | 'waiting' | 'failed';

export interface Activity {
  readonly id: string;
  /** Which turn of the chat (a user message and the runs answering it, approvals included) the step belongs to. */
  readonly turn: number;
  /** delegate: task handed to a subagent; tool: a tool call; auto: an approval granted by a chat permission. */
  readonly kind: 'delegate' | 'tool' | 'auto';
  /** Who acts: the delegating agent, or the agent calling the tool. */
  readonly agent: string;
  /** The delegated-to agent, or the tool name. */
  readonly target: string;
  readonly label: string;
  readonly status: 'running' | 'done' | 'failed';
  /** Client receipt times (ms); 0 when unknown. */
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly args?: Readonly<Record<string, unknown>>;
  /** Start of the tool result, for the expanded step row. */
  readonly preview?: string;
}

export interface PendingApproval {
  readonly interruptId: string;
  readonly requests: readonly ApprovalRequest[];
}

export interface RunState {
  readonly lead: string;
  readonly status: RunStatus;
  readonly streamingText: string;
  readonly activities: readonly Activity[];
  readonly approvals: readonly PendingApproval[];
  readonly usage: { readonly input: number; readonly output: number; readonly cached: number };
  readonly busyAgents: readonly string[];
  /** Turns seen on this event stream; the steps of turn n carry turn = n. */
  readonly turns: number;
  readonly error?: string;
}

const MAX_ACTIVITIES = 300;

export const initialRunState = (lead: string): RunState => ({
  lead,
  status: 'idle',
  streamingText: '',
  activities: [],
  approvals: [],
  usage: { input: 0, output: 0, cached: 0 },
  busyAgents: [],
  turns: 0,
});

function labelFor(tool: string, args: Readonly<Record<string, unknown>>): string {
  const hint = [args.purpose, args.file_path, args.path, args.pattern].find((value) => typeof value === 'string');
  return typeof hint === 'string' && hint ? hint : tool;
}

function busyFrom(activities: readonly Activity[]): string[] {
  const running = activities.filter((activity) => activity.status === 'running');
  const names = running.map((activity) => (activity.kind === 'delegate' ? activity.target : activity.agent));
  return [...new Set(names)];
}

function withActivities(state: RunState, activities: readonly Activity[]): RunState {
  const capped = activities.slice(-MAX_ACTIVITIES);
  // Steps replayed before any run.started still need a turn to sit in.
  return { ...state, activities: capped, busyAgents: busyFrom(capped), turns: Math.max(state.turns, 1) };
}

/** The turn new steps belong to. */
const currentTurn = (state: RunState) => Math.max(state.turns - 1, 0);

const finish = (ok: boolean, at: number, preview?: string) => (activity: Activity): Activity => ({
  ...activity,
  status: ok ? 'done' : 'failed',
  ...(at ? { endedAt: at } : {}),
  ...(preview === undefined ? {} : { preview }),
});

/** Fold one server event into the chat view state. Pure: returns a new state. */
export function reduceRun(state: RunState, event: BusEvent, at = 0): RunState {
  switch (event.type) {
    case 'run.started': {
      const { error: _previousError, ...rest } = state;
      // An answered approval continues the turn; anything else answers a new message.
      const turns = event.resume && state.turns > 0 ? state.turns : state.turns + 1;
      return { ...rest, status: 'running', streamingText: '', approvals: [], turns };
    }
    case 'run.waiting':
      return { ...state, status: 'waiting' };
    case 'run.finished':
      return { ...state, status: 'idle' };
    case 'run.failed':
      return { ...state, status: 'failed', error: event.error };
    case 'token':
      return event.agent === state.lead ? { ...state, streamingText: state.streamingText + event.text } : state;
    case 'usage':
      return {
        ...state,
        usage: {
          input: state.usage.input + event.input,
          output: state.usage.output + event.output,
          cached: state.usage.cached + event.cached,
        },
      };
    case 'approval.required':
      return { ...state, approvals: [...state.approvals, { interruptId: event.interruptId, requests: event.requests }] };
    case 'approval.auto':
      return withActivities(state, [
        ...state.activities,
        ...event.requests.map(
          (request, index): Activity => ({
            id: `auto-${event.interruptId}-${index}`,
            turn: currentTurn(state),
            kind: 'auto',
            agent: 'app',
            target: request.tool,
            label: labelFor(request.tool, request.args),
            status: 'done',
            startedAt: at,
            args: request.args,
          }),
        ),
      ]);
    case 'delegate.start':
      return withActivities(state, [
        ...state.activities,
        { id: event.callId, turn: currentTurn(state), kind: 'delegate', agent: event.agent, target: event.to, label: event.task, status: 'running', startedAt: at },
      ]);
    case 'delegate.end':
      // The subagent's run is over: close its delegation and anything it left open.
      return withActivities(
        state,
        state.activities.map((activity) => {
          if (activity.id === event.callId) return finish(event.ok, at)(activity);
          if (activity.status === 'running' && activity.kind === 'tool' && activity.agent === event.to) return finish(true, at)(activity);
          return activity;
        }),
      );
    case 'tool.start':
      return withActivities(state, [
        ...state.activities,
        {
          id: event.callId,
          turn: currentTurn(state),
          kind: 'tool',
          agent: event.agent,
          target: event.tool,
          label: labelFor(event.tool, event.args),
          status: 'running',
          startedAt: at,
          args: event.args,
        },
      ]);
    case 'tool.end':
      return withActivities(
        state,
        state.activities.map((activity) => (activity.id === event.callId ? finish(event.ok, at, event.preview)(activity) : activity)),
      );
    default:
      return state;
  }
}
