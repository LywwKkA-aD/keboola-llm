import type { AgentActivity } from '../aquarium/state.ts';
import { type Spot, STATION_FACING, STATION_SPOTS, type StationId } from './floorplan.ts';
import type { Vec3 } from './mascot.ts';
import { briefingSpot, pastimes } from './pastimes.ts';

export type { Spot, StationId } from './floorplan.ts';

const IDS: readonly StationId[] = ['command', 'archive', 'console', 'forge', 'beacon'];

/** The first place of every station and the way agents there face. */
export const STATIONS_3D: Readonly<Record<StationId, Spot>> = Object.fromEntries(
  IDS.map((id) => [id, { position: STATION_SPOTS[id][0] as Vec3, facing: STATION_FACING[id] }]),
) as Record<StationId, Spot>;

const STATION_FOR: Partial<Record<AgentActivity, StationId>> = {
  reading: 'archive',
  computing: 'console',
  querying: 'console',
  writing: 'forge',
  working: 'forge',
  waiting: 'beacon',
  planning: 'command',
  delegating: 'command',
};

/** The station an activity takes an agent to, if any. */
export const stationFor = (activity: AgentActivity): StationId | undefined => STATION_FOR[activity];

/** When every place of a station is taken, later agents queue behind them, this far apart. */
const QUEUE_GAP = 1.1;

/** The fixed places of a station (desks, pads), where the scene draws a desk or pad for each. */
export function stationSlots(id: StationId): readonly Vec3[] {
  return STATION_SPOTS[id];
}

/** Where the n-th agent at a station stands: its own place, or in a queue behind the places. */
function placeAt(id: StationId, slot: number): Vec3 {
  const places = STATION_SPOTS[id];
  const [x, y, z] = places[slot % places.length] as Vec3;
  const back = Math.floor(slot / places.length) * QUEUE_GAP;
  const facing = STATION_FACING[id];
  return [x - Math.sin(facing) * back, y, z - Math.cos(facing) * back];
}

/** Moods that leave an agent free for a pastime; a fresh ink cloud does not send it anywhere new either. */
const AT_REST: ReadonlySet<AgentActivity> = new Set(['idle', 'error']);

/**
 * Where every octopus should be for the activities it is placed by. Pure and deterministic for the same time: busy
 * agents go to their station, a delegate that has a task but no station yet stands at the lead's dais, and resting
 * agents follow their pastime (pastimes.ts).
 */
export function layout3d({ names, lead, moods, now = 0 }: {
  names: readonly string[];
  lead: string;
  moods: Readonly<Record<string, AgentActivity>>;
  now?: number;
}): Record<string, Spot> {
  const others = names.filter((name) => name !== lead);
  const moodOf = (name: string): AgentActivity => moods[name] ?? 'idle';
  const stationOf = (name: string) => {
    const id = STATION_FOR[moodOf(name)];
    return id === 'command' && name !== lead ? undefined : id;
  };
  const resting = others.filter((name) => !stationOf(name) && AT_REST.has(moodOf(name)));
  const briefed = others.filter((name) => !stationOf(name) && !AT_REST.has(moodOf(name)));
  const leisure = pastimes(resting, now);
  const used = new Map<StationId, number>();

  return Object.fromEntries(
    [lead, ...others].filter((name) => names.includes(name)).flatMap((name): [string, Spot][] => {
      if (name === lead && !stationOf(name)) return [[name, STATIONS_3D.command]];
      const stationId = stationOf(name);
      if (stationId === 'command') return [[name, STATIONS_3D.command]];
      if (!stationId) return [[name, leisure[name] ?? briefingSpot(Math.max(0, briefed.indexOf(name)))]];
      const slot = used.get(stationId) ?? 0;
      used.set(stationId, slot + 1);
      return [[name, { position: placeAt(stationId, slot), facing: STATION_FACING[stationId] }]];
    }),
  );
}
