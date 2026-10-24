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
  /**
   * What the agent's current task has it doing at a station (e.g. computing in Keboola). Kept while it thinks between
   * tool calls, so it stays at that station instead of walking back to rest after every call.
   */
  readonly work?: AgentActivity;
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
const PLAN_TOOLS = new Set(['write_todos', 'request_plan_approval']);

/** Activities that put an agent at a station for the rest of its task (planning only does for the lead). */
const STATION_WORK: ReadonlySet<AgentActivity> = new Set(['reading', 'writing', 'computing', 'querying', 'working']);

export function activityForTool(tool: string, _args: Readonly<Record<string, unknown>>): AgentActivity {
  if (READ_TOOLS.has(tool)) return 'reading';
  if (WRITE_TOOLS.has(tool)) return 'writing';
  if (tool === 'kbagent_sql') return 'querying';
  if (tool.startsWith('kbagent')) return 'computing';
  if (PLAN_TOOLS.has(tool)) return 'planning';
  return 'working';
}

const workOf = (agent: AgentState | undefined) => (agent?.work ? { work: agent.work } : {});

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

/**
 * A paused run goes on after the user answered: whoever waited at the bell walks on to the station of the approved
 * tool (it runs now, a job may take minutes). Continuing a stopped run wakes the lead, as a new run does.
 */
function resumeThread(state: AquariumState, threadId: string, now: number): AquariumState {
  const busy = Object.values(state.agents).some((agent) => agent.threadId === threadId && agent.activity !== 'idle' && agent.activity !== 'error');
  if (!busy) return set(state, state.lead, { activity: 'thinking', label: '', threadId }, now);
  const agents = Object.fromEntries(
    Object.entries(state.agents).map(([name, agent]) => {
      if (agent.threadId !== threadId || agent.activity !== 'waiting') return [name, agent];
      const activity = activityForTool(agent.label, {});
      const work = STATION_WORK.has(activity) ? { work: activity } : workOf(agent);
      return [name, { activity, label: agent.label, since: now, threadId, ...(agent.partner ? { partner: agent.partner } : {}), ...work }];
    }),
  );
  return { ...state, agents };
}

/** Fold one server event (from any chat) into what every octopus is doing. Pure. */
export function reduceAquarium(state: AquariumState, { threadId, event }: Envelope, now: number): AquariumState {
  switch (event.type) {
    case 'run.started':
      return event.resume ? resumeThread(state, threadId, now) : set(state, state.lead, { activity: 'thinking', label: '', threadId }, now);
    case 'run.finished':
      return settleThread(state, threadId, 'idle', now);
    case 'run.failed':
      return settleThread(state, threadId, 'error', now);
    case 'token': {
      const current = state.agents[event.agent];
      if (current?.activity === 'waiting') return state;
      return set(state, event.agent, { activity: 'thinking', label: current?.label ?? '', threadId, ...workOf(current) }, now);
    }
    case 'tool.start': {
      const activity = activityForTool(event.tool, event.args);
      const work = STATION_WORK.has(activity) ? { work: activity } : workOf(state.agents[event.agent]);
      const next = set(state, event.agent, { activity, label: labelOf(event.tool, event.args), threadId, ...work }, now);
      return { ...next, lastToolUser: { ...next.lastToolUser, [event.tool]: event.agent } };
    }
    case 'tool.end':
      return set(state, event.agent, { activity: 'thinking', label: '', threadId, ...workOf(state.agents[event.agent]) }, now);
    case 'delegate.start': {
      const lead = set(state, event.agent, { activity: 'delegating', label: event.task, threadId, partner: event.to }, now);
      // A new task: the delegate starts it from wherever it rests.
      return set(lead, event.to, { activity: 'thinking', label: event.task, threadId }, now);
    }
    case 'delegate.end': {
      const rested = set(state, event.to, { activity: 'idle', label: '', threadId }, now);
      return set(rested, event.agent, { activity: 'thinking', label: '', threadId }, now);
    }
    case 'approval.required':
      return event.requests.reduce((current, request) => {
        const agent = current.lastToolUser[request.tool] ?? current.lead;
        return set(current, agent, { activity: 'waiting', label: request.tool, threadId, ...workOf(current.agents[agent]) }, now);
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
