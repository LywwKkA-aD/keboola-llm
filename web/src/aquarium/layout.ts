import type { AgentActivity } from './state.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const SCENE = { width: 1200, height: 700 } as const;

/** Where octopuses go for each kind of work (the point is where the first one floats). */
export const STATIONS = {
  desk: { x: 600, y: 250 },
  bookshelf: { x: 175, y: 300 },
  computers: { x: 930, y: 300 },
  workbench: { x: 420, y: 420 },
  bell: { x: 1090, y: 110 },
} as const satisfies Record<string, Point>;

type Station = keyof typeof STATIONS;

const STATION_FOR: Partial<Record<AgentActivity, Station>> = {
  reading: 'bookshelf',
  computing: 'computers',
  querying: 'computers',
  writing: 'workbench',
  working: 'workbench',
  waiting: 'bell',
  planning: 'desk',
  delegating: 'desk',
};

const SLOT_SPACING = 115;
const LOUNGE = { top: 560, left: 90, right: SCENE.width - 90, rowGap: 85, perRow: 8 } as const;

/** Second, third... agent at a station float beside the first: right, left, further right... */
const slotOffset = (slot: number) => (slot === 0 ? 0 : Math.ceil(slot / 2) * SLOT_SPACING * (slot % 2 === 1 ? 1 : -1));

function loungeSpot(index: number): Point {
  const row = Math.floor(index / LOUNGE.perRow);
  const column = index % LOUNGE.perRow;
  const step = (LOUNGE.right - LOUNGE.left) / (LOUNGE.perRow - 1);
  // Odd rows shift half a step so octopuses do not stack exactly above each other.
  return { x: LOUNGE.left + column * step + (row % 2) * (step / 2), y: LOUNGE.top + row * LOUNGE.rowGap };
}

/** Target position of every octopus for the current moods. Pure and deterministic. */
export function layoutAgents({ names, lead, moods }: {
  names: readonly string[];
  lead: string;
  moods: Readonly<Record<string, AgentActivity>>;
}): Record<string, Point> {
  const others = names.filter((name) => name !== lead);
  const home = (name: string): Point => (name === lead ? STATIONS.desk : loungeSpot(others.indexOf(name)));

  const slots = new Map<Station, number>();
  return Object.fromEntries(
    [lead, ...others].map((name) => {
      const station = STATION_FOR[moods[name] ?? 'idle'];
      if (!station || (station === 'desk' && name === lead)) return [name, home(name)];
      const slot = slots.get(station) ?? 0;
      slots.set(station, slot + 1);
      const base = STATIONS[station];
      return [name, { x: base.x + slotOffset(slot), y: base.y }];
    }),
  );
}
