import type { Vec3 } from './mascot.ts';

/**
 * The data-centre hall seen from the front (camera on +z): six rows of racks running away from the camera, aisles
 * between them, a corridor along the front and the back, walkways along both walls, and an open operations floor in
 * front. Agents walk along the aisles and corridors, never through racks; pastimes.ts says where they rest.
 */

export type StationId = 'command' | 'archive' | 'console' | 'forge' | 'beacon';

/** What a resting agent does at its spot (pastimes.ts). */
export type Pastime = 'inspect' | 'chat' | 'stroll';

export interface Spot {
  readonly position: Vec3;
  /** Yaw (radians); 0 faces the camera side (+z), PI/2 faces +x. */
  readonly facing: number;
  /** Top walking speed on the way there; errands use the default. */
  readonly pace?: number;
  readonly pastime?: Pastime;
}

export interface RackPlacement {
  /** Centre of the rack's footprint on the floor. */
  readonly position: Vec3;
  /** Yaw turning the rack's front (local +z) toward its cold aisle. */
  readonly rotation: number;
  readonly height: number;
}

export const FLOOR_Y = -0.6;
/** Height of an octopus' origin above the floor plane used by the scene. */
export const AGENT_Y = 0.2;

export const RACK = { width: 0.92, depth: 1.0, height: 2.3 } as const;
const RACKS_PER_ROW = 10;
/** Rows span z from BACK_Z to FRONT_Z. */
export const ROW_Z = { back: -11.6, front: -2.4 } as const;

/** Each row: its x and which way its fronts face (into a cold aisle). Cold aisles at x = -6.7, 0, 6.7. */
export const RACK_ROWS: readonly { readonly x: number; readonly front: 1 | -1 }[] = [
  { x: -8.4, front: 1 },
  { x: -5.0, front: -1 },
  { x: -1.6, front: 1 },
  { x: 1.6, front: -1 },
  { x: 5.0, front: 1 },
  { x: 8.4, front: -1 },
];

const AISLES = [-6.7, -3.3, 0, 3.3, 6.7] as const;
const FRONT_Z = -1.2;
const BACK_Z = -12.8;
const SIDE_X = 10;
/** The front floor: a cross corridor in front of the lead's dais, the station columns at its ends. */
const FLOOR_Z = 4.4;
const STATION_COLUMN_X = 8.3;

/** Every rack in the hall, row by row, back to front. */
export function rackPlacements(): RackPlacement[] {
  return RACK_ROWS.flatMap((row) =>
    Array.from({ length: RACKS_PER_ROW }, (_, i) => ({
      position: [row.x, FLOOR_Y, ROW_Z.back + RACK.width / 2 + i * RACK.width] as Vec3,
      rotation: (row.front * Math.PI) / 2,
      // A few taller units break the skyline a little.
      height: RACK.height + (i % 4 === 1 ? 0.25 : 0),
    })),
  );
}

const at = (x: number, z: number): Vec3 => [x, AGENT_Y, z];

/** Where agents stand at each station, first place first. */
export const STATION_SPOTS: Readonly<Record<StationId, readonly Vec3[]>> = {
  // The lead on its dais in the middle of the operations floor, facing the camera.
  command: [at(0, 1.8)],
  // Keboola operations: desks along the right wall.
  console: [at(10.6, -4.0), at(10.6, -7.0), at(10.6, -10.0)],
  // The knowledge archive: a tape library along the left wall.
  archive: [at(-10.6, -4.0), at(-10.6, -7.0), at(-10.6, -10.0)],
  // Build bench in the front-left corner, approvals checkpoint in the front-right corner.
  forge: [at(-STATION_COLUMN_X, 0.9), at(-STATION_COLUMN_X, 2.6), at(-STATION_COLUMN_X, 4.3)],
  beacon: [at(STATION_COLUMN_X, 0.9), at(STATION_COLUMN_X, 2.6), at(STATION_COLUMN_X, 4.3)],
};

export const STATION_FACING: Readonly<Record<StationId, number>> = {
  command: 0,
  console: Math.PI / 2,
  archive: -Math.PI / 2,
  forge: -Math.PI / 2,
  beacon: Math.PI / 2,
};

// ---- Routing ---------------------------------------------------------------------------------------------------

type Point = readonly [number, number];

interface Segment {
  readonly a: Point;
  readonly b: Point;
}

const segment = (a: Point, b: Point): Segment => ({ a, b });

/** Corridors agents walk along (axis-aligned centre lines). */
const CORRIDORS: readonly Segment[] = [
  segment([-SIDE_X, BACK_Z], [SIDE_X, BACK_Z]),
  segment([-SIDE_X, FRONT_Z], [SIDE_X, FRONT_Z]),
  segment([-STATION_COLUMN_X, FLOOR_Z], [STATION_COLUMN_X, FLOOR_Z]),
  segment([-SIDE_X, BACK_Z], [-SIDE_X, FRONT_Z]),
  segment([SIDE_X, BACK_Z], [SIDE_X, FRONT_Z]),
  ...AISLES.map((x) => segment([x, BACK_Z], [x, FRONT_Z])),
  // Up to the lead's place on the dais; nobody else crosses the dais.
  segment([0, FRONT_Z], [0, 1.8]),
  segment([-STATION_COLUMN_X, FRONT_Z], [-STATION_COLUMN_X, 4.6]),
  segment([STATION_COLUMN_X, FRONT_Z], [STATION_COLUMN_X, 4.6]),
];

/** Racks grown by an octopus' half width: a straight walk is clear when it touches none of these. */
const OBSTACLES = rackPlacements().map(({ position: [x, , z] }) => {
  const margin = 0.32;
  return { minX: x - RACK.depth / 2 - margin, maxX: x + RACK.depth / 2 + margin, minZ: z - RACK.width / 2 - margin, maxZ: z + RACK.width / 2 + margin };
});

/** Slab test: does the segment p-q pass through an axis-aligned box? */
function hitsBox(p: Point, q: Point, box: (typeof OBSTACLES)[number]): boolean {
  let enter = 0;
  let exit = 1;
  for (const [start, delta, min, max] of [
    [p[0], q[0] - p[0], box.minX, box.maxX],
    [p[1], q[1] - p[1], box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(delta) < 1e-12) {
      if (start <= min || start >= max) return false;
      continue;
    }
    const t1 = (min - start) / delta;
    const t2 = (max - start) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter >= exit) return false;
  }
  return true;
}


function nearestOn({ a, b }: Segment, p: Point): Point {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return [a[0] + dx * t, a[1] + dz * t];
}

const distance = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const same = (p: Point, q: Point) => distance(p, q) < 1e-6;
const onSegment = (s: Segment, p: Point) => distance(nearestOn(s, p), p) < 1e-6;

/** The lead's dais, grown by an octopus' half width: walks go around it (only the lead's own way crosses it). */
export const DAIS = { x: 0, z: 1.8, radius: 1.62 + 0.32 } as const;

/** Does the segment p-q come closer to the dais centre than its radius? */
function hitsDais(p: Point, q: Point): boolean {
  const centre: Point = [DAIS.x, DAIS.z];
  const closest = same(p, q) ? p : nearestOn({ a: p, b: q }, centre);
  return distance(closest, centre) < DAIS.radius;
}

const clear = (p: Point, q: Point) => !hitsDais(p, q) && OBSTACLES.every((box) => !hitsBox(p, q, box));

/** The nearest point on the corridor network that p reaches in a straight, clear line (or that p is on). */
function entryOf(p: Point): Point {
  const candidates = CORRIDORS.map((s) => nearestOn(s, p)).toSorted((a, b) => distance(a, p) - distance(b, p));
  return candidates.find((q) => distance(q, p) < 1e-6 || clear(p, q)) ?? (candidates[0] as Point);
}

/** Corridor crossings and ends: the fixed nodes of the walking graph. */
const JUNCTIONS: readonly Point[] = (() => {
  const points = CORRIDORS.flatMap((s, i) =>
    CORRIDORS.slice(i + 1).flatMap((t) => {
      const sVertical = s.a[0] === s.b[0];
      const tVertical = t.a[0] === t.b[0];
      if (sVertical === tVertical) return [];
      const [v, h] = sVertical ? [s, t] : [t, s];
      const cross: Point = [v.a[0], h.a[1]];
      return onSegment(v, cross) && onSegment(h, cross) ? [cross] : [];
    }),
  );
  const ends = CORRIDORS.flatMap((s) => [s.a, s.b]);
  return [...points, ...ends].filter((p, i, all) => all.findIndex((q) => same(p, q)) === i);
})();

/** Shortest walk along the corridors between two points that lie on them (Dijkstra on a tiny graph). */
function corridorPath(start: Point, goal: Point): Point[] {
  const nodes = [start, goal, ...JUNCTIONS].filter((p, i, all) => all.findIndex((q) => same(p, q)) === i);
  const neighbours = nodes.map((p) =>
    CORRIDORS.filter((s) => onSegment(s, p)).flatMap((s) => {
      const along = nodes.map((q, j) => ({ q, j })).filter(({ q }) => !same(q, p) && onSegment(s, q));
      const vertical = s.a[0] === s.b[0];
      const key = (q: Point) => (vertical ? q[1] : q[0]);
      const before = along.filter(({ q }) => key(q) < key(p)).sort((x, y) => key(y.q) - key(x.q))[0];
      const after = along.filter(({ q }) => key(q) > key(p)).sort((x, y) => key(x.q) - key(y.q))[0];
      return [before, after].flatMap((n) => (n ? [n.j] : []));
    }),
  );
  const cost = nodes.map((_, i) => (i === 0 ? 0 : Infinity));
  const previous = nodes.map(() => -1);
  const done = new Set<number>();
  while (done.size < nodes.length) {
    const current = cost.reduce((best, c, i) => (!done.has(i) && (best === -1 || c < (cost[best] ?? Infinity)) ? i : best), -1);
    if (current === -1 || cost[current] === Infinity) break;
    done.add(current);
    if (current === 1) break;
    (neighbours[current] ?? []).forEach((next) => {
      const through = (cost[current] ?? Infinity) + distance(nodes[current] as Point, nodes[next] as Point);
      if (through < (cost[next] ?? Infinity)) {
        cost[next] = through;
        previous[next] = current;
      }
    });
  }
  const path: Point[] = [];
  for (let i = 1; i !== -1; i = previous[i] ?? -1) path.unshift(nodes[i] as Point);
  return path[0] && same(path[0], start) ? path : [start, goal];
}

/** Cut corners where the straight way is clear, so agents do not zigzag on open floor. */
function smooth(points: readonly Point[]): Point[] {
  const result: Point[] = [points[0] as Point];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !clear(points[i] as Point, points[j] as Point)) j -= 1;
    result.push(points[j] as Point);
    i = j;
  }
  return result;
}

/** The way an agent walks from one place to another: along the aisles and corridors, around every rack. */
export function route(from: Vec3, to: Vec3): Vec3[] {
  const p: Point = [from[0], from[2]];
  const q: Point = [to[0], to[2]];
  if (same(p, q) || clear(p, q)) return [from, to];
  const entry = entryOf(p);
  const exit = entryOf(q);
  const points = [p, ...corridorPath(entry, exit), q].filter((point, i, all) => i === 0 || !same(point, all[i - 1] as Point));
  const y = to[1];
  const walk = smooth(points).map(([x, z]): Vec3 => [x, y, z]);
  return [from, ...walk.slice(1, -1), to];
}
