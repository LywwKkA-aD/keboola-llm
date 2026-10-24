import type { AgentInfo } from '../api/types.ts';
import { type AgentActivity, type AquariumState, moodOf } from '../aquarium/state.ts';
import { layout3d, type Spot, stationFor, type StationId } from './layout3d.ts';

export interface SceneModel {
  readonly moods: Readonly<Record<string, AgentActivity>>;
  readonly spots: Readonly<Record<string, Spot>>;
  readonly stations: Readonly<Record<StationId, boolean>>;
  /** How many agents are at each station (places light up per agent). */
  readonly occupancy: Readonly<Record<StationId, number>>;
  /** Agents the lead is currently working with (same chat, not resting). */
  readonly links: readonly string[];
  readonly captions: Readonly<Record<string, string>>;
}


/** Everything the 3D scene shows, derived from the team and the live aquarium state. Pure. */
export function buildSceneModel({ agents, lead, state, now }: {
  agents: readonly AgentInfo[];
  lead: string;
  state: AquariumState;
  now: number;
}): SceneModel {
  const names = agents.map((agent) => agent.name);
  const moods = Object.fromEntries(names.map((name) => [name, moodOf(state.agents[name], now)]));
  // Where to stand follows the task, not the moment: thinking between tool calls keeps an agent at its station, and
  // only the lead plans at the command dais.
  const placeAs = (name: string): AgentActivity => {
    const mood = moods[name] ?? 'idle';
    const work = state.agents[name]?.work;
    if (mood === 'planning' && name !== lead) return work ?? 'idle';
    if (mood === 'thinking' && work) return work;
    return mood;
  };
  const placements = Object.fromEntries(names.map((name) => [name, placeAs(name)]));
  const atStations = Object.values(placements).flatMap((activity) => stationFor(activity) ?? []);
  const count = (id: StationId) => atStations.filter((station) => station === id).length;
  const occupancy = { command: count('command'), archive: count('archive'), console: count('console'), forge: count('forge'), beacon: count('beacon') };
  const stations = {
    command: occupancy.command > 0,
    archive: occupancy.archive > 0,
    console: occupancy.console > 0,
    forge: occupancy.forge > 0,
    beacon: occupancy.beacon > 0,
  };
  const leadThread = state.agents[lead]?.threadId;
  const links = names.filter(
    (name) => name !== lead && moods[name] !== 'idle' && moods[name] !== 'error' && leadThread !== undefined && state.agents[name]?.threadId === leadThread,
  );
  const captions = Object.fromEntries(names.map((name) => [name, moods[name] === 'idle' ? '' : (state.agents[name]?.label ?? '')]));
  return { moods, spots: layout3d({ names, lead, moods: placements }), stations, occupancy, links, captions };
}
