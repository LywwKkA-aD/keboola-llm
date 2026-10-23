import type { AgentInfo } from '../api/types.ts';
import { type AgentActivity, type AquariumState, moodOf } from '../aquarium/state.ts';
import { layout3d, type Spot, type StationId } from './layout3d.ts';

export interface SceneModel {
  readonly moods: Readonly<Record<string, AgentActivity>>;
  readonly spots: Readonly<Record<string, Spot>>;
  readonly stations: Readonly<Record<StationId, boolean>>;
  /** Agents the lead is currently working with (same chat, not resting). */
  readonly links: readonly string[];
  readonly captions: Readonly<Record<string, string>>;
}

const STATION_OF: Partial<Record<AgentActivity, StationId>> = {
  reading: 'archive',
  computing: 'console',
  querying: 'console',
  writing: 'forge',
  working: 'forge',
  waiting: 'beacon',
  planning: 'command',
  delegating: 'command',
};

/** Everything the 3D scene shows, derived from the team and the live aquarium state. Pure. */
export function buildSceneModel({ agents, lead, state, now }: {
  agents: readonly AgentInfo[];
  lead: string;
  state: AquariumState;
  now: number;
}): SceneModel {
  const names = agents.map((agent) => agent.name);
  const moods = Object.fromEntries(names.map((name) => [name, moodOf(state.agents[name], now)]));
  const used = new Set(Object.values(moods).flatMap((mood) => STATION_OF[mood] ?? []));
  const stations = {
    command: used.has('command'),
    archive: used.has('archive'),
    console: used.has('console'),
    forge: used.has('forge'),
    beacon: used.has('beacon'),
  };
  const leadThread = state.agents[lead]?.threadId;
  const links = names.filter(
    (name) => name !== lead && moods[name] !== 'idle' && moods[name] !== 'error' && leadThread !== undefined && state.agents[name]?.threadId === leadThread,
  );
  const captions = Object.fromEntries(names.map((name) => [name, moods[name] === 'idle' ? '' : (state.agents[name]?.label ?? '')]));
  return { moods, spots: layout3d({ names, lead, moods }), stations, links, captions };
}
