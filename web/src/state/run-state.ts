import type { ApprovalRequest, BusEvent } from '../api/types.ts';

export type RunStatus = 'idle' | 'running' | 'waiting' | 'failed';

export interface Activity {
  readonly id: string;
  readonly kind: 'delegate' | 'tool';
  /** Who acts: the delegating agent, or the agent calling the tool. */
  readonly agent: string;
  /** The delegated-to agent, or the tool name. */
  readonly target: string;
  readonly label: string;
  readonly status: 'running' | 'done' | 'failed';
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
  return { ...state, activities: capped, busyAgents: busyFrom(capped) };
}

const finish = (ok: boolean) => (activity: Activity): Activity => ({ ...activity, status: ok ? 'done' : 'failed' });

/** Fold one server event into the chat view state. Pure: returns a new state. */
export function reduceRun(state: RunState, event: BusEvent): RunState {
  switch (event.type) {
    case 'run.started': {
      const { error: _previousError, ...rest } = state;
      return { ...rest, status: 'running', streamingText: '', approvals: [] };
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
    case 'delegate.start':
      return withActivities(state, [
        ...state.activities,
        { id: event.callId, kind: 'delegate', agent: event.agent, target: event.to, label: event.task, status: 'running' },
      ]);
    case 'delegate.end':
      // The subagent's run is over: close its delegation and anything it left open.
      return withActivities(
        state,
        state.activities.map((activity) => {
          if (activity.id === event.callId) return finish(event.ok)(activity);
          if (activity.status === 'running' && activity.kind === 'tool' && activity.agent === event.to) return finish(true)(activity);
          return activity;
        }),
      );
    case 'tool.start':
      return withActivities(state, [
        ...state.activities,
        { id: event.callId, kind: 'tool', agent: event.agent, target: event.tool, label: labelFor(event.tool, event.args), status: 'running' },
      ]);
    case 'tool.end':
      return withActivities(
        state,
        state.activities.map((activity) => (activity.id === event.callId ? finish(event.ok)(activity) : activity)),
      );
    default:
      return state;
  }
}
