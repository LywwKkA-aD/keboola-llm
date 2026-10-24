import type { AgentActivity } from '../aquarium/state.ts';
import { IDLE_SPOTS, type Spot, STATION_FACING, STATION_SPOTS, type StationId } from './floorplan.ts';
import type { Vec3 } from './mascot.ts';

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

/** Resting places in the aisles; past the last one, agents share an aisle spot a step to the side. */
export function restSpot(index: number): Spot {
  const spot = IDLE_SPOTS[index % IDLE_SPOTS.length] as Spot;
  const lap = Math.floor(index / IDLE_SPOTS.length);
  if (lap === 0) return spot;
  const [x, y, z] = spot.position;
  return { position: [x, y, z + (lap % 2 === 1 ? 0.9 : -0.9) * Math.ceil(lap / 2)], facing: spot.facing };
}

/** Where every octopus should be for the activities it is placed by. Pure and deterministic. */
export function layout3d({ names, lead, moods }: {
  names: readonly string[];
  lead: string;
  moods: Readonly<Record<string, AgentActivity>>;
}): Record<string, Spot> {
  const others = names.filter((name) => name !== lead);
  const home = (name: string): Spot => (name === lead ? STATIONS_3D.command : restSpot(others.indexOf(name)));
  const used = new Map<StationId, number>();

  return Object.fromEntries(
    [lead, ...others].filter((name) => names.includes(name)).map((name) => {
      const stationId = STATION_FOR[moods[name] ?? 'idle'];
      if (!stationId || stationId === 'command') return [name, home(name)];
      const slot = used.get(stationId) ?? 0;
      used.set(stationId, slot + 1);
      return [name, { position: placeAt(stationId, slot), facing: STATION_FACING[stationId] }];
    }),
  );
}
