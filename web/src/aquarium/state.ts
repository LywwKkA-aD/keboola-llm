import type { Envelope } from '../api/types.ts';

/** What an octopus is doing; each maps to a station in the scene. */
export type AgentActivity =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'computing'
  | 'querying'
  | 'planning'
  | 'delegating'
  | 'waiting'
  | 'working'
  | 'error';

export interface AgentState {
  readonly activity: AgentActivity;
  readonly label: string;
  readonly since: number;
  readonly threadId: string;
  /** For a delegating lead: whom it is talking to. */
  readonly partner?: string;
}

export interface AquariumState {
  readonly lead: string;
  readonly agents: Readonly<Record<string, AgentState>>;
  /** Last agent that started each tool, to know who is waiting at the approval bell. */
  readonly lastToolUser: Readonly<Record<string, string>>;
}

const ERROR_VISIBLE_MS = 5000;

export const initialAquarium = (lead: string): AquariumState => ({ lead, agents: {}, lastToolUser: {} });

const READ_TOOLS = new Set(['read_file', 'ls', 'glob', 'grep']);
const WRITE_TOOLS = new Set(['write_file', 'edit_file']);

export function activityForTool(tool: string, _args: Readonly<Record<string, unknown>>): AgentActivity {
  if (READ_TOOLS.has(tool)) return 'reading';
  if (WRITE_TOOLS.has(tool)) return 'writing';
  if (tool === 'kbagent_sql') return 'querying';
  if (tool.startsWith('kbagent')) return 'computing';
  if (tool === 'write_todos') return 'planning';
  return 'working';
}

const labelOf = (tool: string, args: Readonly<Record<string, unknown>>) => {
  const hint = [args.purpose, args.file_path, args.path, args.pattern].find((value) => typeof value === 'string');
  return typeof hint === 'string' && hint ? hint : tool;
};

function set(state: AquariumState, name: string, next: Omit<AgentState, 'since'>, now: number): AquariumState {
  return { ...state, agents: { ...state.agents, [name]: { ...next, since: now } } };
}

function settleThread(state: AquariumState, threadId: string, activity: 'idle' | 'error', now: number): AquariumState {
  const agents = Object.fromEntries(
    Object.entries(state.agents).map(([name, agent]) =>
      agent.threadId === threadId && agent.activity !== 'idle' ? [name, { activity, label: '', since: now, threadId }] : [name, agent],
    ),
  );
  return { ...state, agents };
}

/** Fold one server event (from any chat) into what every octopus is doing. Pure. */
export function reduceAquarium(state: AquariumState, { threadId, event }: Envelope, now: number): AquariumState {
  switch (event.type) {
    case 'run.started':
      return set(state, state.lead, { activity: 'thinking', label: '', threadId }, now);
    case 'run.finished':
      return settleThread(state, threadId, 'idle', now);
    case 'run.failed':
      return settleThread(state, threadId, 'error', now);
    case 'token': {
      if (state.agents[event.agent]?.activity === 'waiting') return state;
      return set(state, event.agent, { activity: 'thinking', label: state.agents[event.agent]?.label ?? '', threadId }, now);
    }
    case 'tool.start': {
      const next = set(state, event.agent, { activity: activityForTool(event.tool, event.args), label: labelOf(event.tool, event.args), threadId }, now);
      return { ...next, lastToolUser: { ...next.lastToolUser, [event.tool]: event.agent } };
    }
    case 'tool.end':
      return set(state, event.agent, { activity: 'thinking', label: '', threadId }, now);
    case 'delegate.start': {
      const lead = set(state, event.agent, { activity: 'delegating', label: event.task, threadId, partner: event.to }, now);
      return set(lead, event.to, { activity: 'thinking', label: event.task, threadId }, now);
    }
    case 'delegate.end': {
      const rested = set(state, event.to, { activity: 'idle', label: '', threadId }, now);
      return set(rested, event.agent, { activity: 'thinking', label: '', threadId }, now);
    }
    case 'approval.required':
      return event.requests.reduce((current, request) => {
        const agent = current.lastToolUser[request.tool] ?? current.lead;
        return set(current, agent, { activity: 'waiting', label: request.tool, threadId }, now);
      }, state);
    default:
      return state;
  }
}

/** The activity to draw right now: an ink cloud fades back to idle after a few seconds. */
export function moodOf(agent: AgentState | undefined, now: number): AgentActivity {
  if (!agent) return 'idle';
  if (agent.activity === 'error' && now - agent.since > ERROR_VISIBLE_MS) return 'idle';
  return agent.activity;
}
