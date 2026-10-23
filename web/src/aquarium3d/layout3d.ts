import type { AgentActivity } from '../aquarium/state.ts';
import type { Vec3 } from './mascot.ts';

export interface Spot {
  readonly position: Vec3;
  /** Yaw (radians) the octopus turns to; 0 faces the camera side (+z). */
  readonly facing: number;
}

export type StationId = 'command' | 'archive' | 'console' | 'forge' | 'beacon';

/** Work stations on the seabed. Position is where the first octopus floats; facing turns it to the station. */
export const STATIONS_3D: Readonly<Record<StationId, Spot & { readonly label: string }>> = {
  command: { position: [0, 0.4, 1.2], facing: 0, label: 'command' },
  archive: { position: [-7.6, 0.2, 0.2], facing: -Math.PI / 2, label: 'archive' },
  console: { position: [6.9, 0.2, 0.9], facing: Math.PI / 2, label: 'console' },
  forge: { position: [-3.9, 0.2, 6.0], facing: -Math.PI / 4, label: 'forge' },
  beacon: { position: [3.9, 0.2, 6.4], facing: -0.3, label: 'beacon' },
};

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

const SLOT_GAP = 1.15;
const REEF = { radius: 10.5, centerZ: 0.5, y: 0.08, from: Math.PI * 1.14, to: Math.PI * 1.86, rowGap: 1.6 } as const;
const PER_ROW = 12;

/** Agents sharing a station line up beside the first one, alternating sides, along the station's tangent. */
function slotAt(station: Spot, slot: number): Vec3 {
  if (slot === 0) return station.position;
  const side = slot % 2 === 1 ? 1 : -1;
  const offset = Math.ceil(slot / 2) * SLOT_GAP * side;
  const [x, y, z] = station.position;
  return [x + Math.cos(station.facing) * offset, y, z - Math.sin(station.facing) * offset];
}

/** Resting places: an arc of pods behind the stations, a second arc further out when crowded. */
export function reefSpot(index: number): Spot {
  const row = Math.floor(index / PER_ROW);
  const column = index % PER_ROW;
  const t = (column + 0.5 + (row % 2) * 0.5) / PER_ROW;
  const angle = REEF.from + (REEF.to - REEF.from) * t;
  const radius = REEF.radius + row * REEF.rowGap;
  const position: Vec3 = [Math.cos(angle) * radius, REEF.y + row * 0.4, REEF.centerZ + Math.sin(angle) * radius];
  // Face the middle of the scene.
  return { position, facing: Math.atan2(-position[0], -position[2]) };
}

/** Where every octopus should be for the current moods. Pure and deterministic. */
export function layout3d({ names, lead, moods }: {
  names: readonly string[];
  lead: string;
  moods: Readonly<Record<string, AgentActivity>>;
}): Record<string, Spot> {
  const others = names.filter((name) => name !== lead);
  const home = (name: string): Spot => (name === lead ? STATIONS_3D.command : reefSpot(others.indexOf(name)));
  const used = new Map<StationId, number>();

  return Object.fromEntries(
    [lead, ...others].filter((name) => names.includes(name)).map((name) => {
      const stationId = STATION_FOR[moods[name] ?? 'idle'];
      if (!stationId || (stationId === 'command' && name === lead)) return [name, home(name)];
      const slot = used.get(stationId) ?? 0;
      used.set(stationId, slot + 1);
      const station = STATIONS_3D[stationId];
      return [name, { position: slotAt(station, slot), facing: station.facing }];
    }),
  );
}
