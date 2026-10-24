import { describe, expect, it } from 'vitest';
import { DAIS, RACK_ROWS, rackPlacements, route, STATION_SPOTS } from './floorplan.ts';
import { BRIEFING_SPOTS, INSPECT_SPOTS, MEETING_POINTS, STROLL_PATHS } from './pastimes.ts';
import type { Vec3 } from './mascot.ts';

/** Footprints of all racks on the floor (x/z boxes), slightly shrunk so touching an edge is not a crossing. */
const footprints = rackPlacements().map(({ position: [x, , z], rotation }) => {
  const alongZ = Math.abs(Math.sin(rotation)) > 0.5;
  const halfX = (alongZ ? 0.5 : 0.46) - 0.02;
  const halfZ = (alongZ ? 0.46 : 0.5) - 0.02;
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
});

const inRack = ([x, , z]: Vec3) => footprints.some((box) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ);

/** Sample a polyline every 5 cm: no sample may stand inside a rack. */
function crossesRack(path: readonly Vec3[]): boolean {
  return path.slice(1).some((end, i) => {
    const start = path[i] as Vec3;
    const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
    const steps = Math.max(1, Math.ceil(length / 0.05));
    return Array.from({ length: steps + 1 }, (_, s) => s / steps).some((t) =>
      inRack([start[0] + (end[0] - start[0]) * t, 0, start[2] + (end[2] - start[2]) * t]),
    );
  });
}

// Every kind of place once per aisle side: the other inspect places of a rack face only differ along the same aisle.
// Walking between every pair of them is a few thousand routes, so the pair tests get more time on a busy machine.
const places: Vec3[] = [
  ...Object.values(STATION_SPOTS).flat(),
  ...[...INSPECT_SPOTS.slice(0, 6), ...BRIEFING_SPOTS].map((spot) => spot.position),
  ...MEETING_POINTS,
  ...STROLL_PATHS.flat(),
];
const PAIRS_TIMEOUT_MS = 30_000;

describe('floorplan', () => {
  it('lays racks out in straight rows, not around a stage', () => {
    expect(RACK_ROWS.length).toBeGreaterThanOrEqual(4);
    const racks = rackPlacements();
    RACK_ROWS.forEach((row) => {
      const xs = new Set(racks.filter((rack) => Math.abs(rack.position[0] - row.x) < 1e-9).map((rack) => rack.position[0]));
      expect(xs.size).toBe(1);
    });
  });

  it('keeps every station place and resting place out of the racks', () => {
    [...places, ...INSPECT_SPOTS.map((spot) => spot.position)].forEach((place) => expect(inRack(place)).toBe(false));
  });

  it('walks between any two places along the aisles, never through a rack', () => {
    places.forEach((from) =>
      places.forEach((to) => {
        const path = route(from, to);
        expect(path[0]).toEqual(from);
        expect(path.at(-1)).toEqual(to);
        expect(crossesRack(path)).toBe(false);
      }),
    );
  }, PAIRS_TIMEOUT_MS);

  it('takes a reasonable way: never more than three times the straight distance plus a detour', () => {
    const from = STATION_SPOTS.archive[0] as Vec3;
    const to = STATION_SPOTS.console[0] as Vec3;
    const length = route(from, to).slice(1).reduce((sum, end, i, rest) => {
      const start = i === 0 ? from : (rest[i - 1] as Vec3);
      return sum + Math.hypot(end[0] - start[0], end[2] - start[2]);
    }, 0);
    expect(length).toBeLessThan(Math.hypot(to[0] - from[0], to[2] - from[2]) * 3 + 6);
  });

  it('walks around the lead\'s dais, except on the way to the lead\'s own place on it', () => {
    const command = STATION_SPOTS.command[0] as Vec3;
    const crossesDais = (path: readonly Vec3[]) =>
      path.slice(1).some((end, i) => {
        const start = path[i] as Vec3;
        return Array.from({ length: 21 }, (_, k) => k / 20).some((t) => {
          const x = start[0] + (end[0] - start[0]) * t;
          const z = start[2] + (end[2] - start[2]) * t;
          return Math.hypot(x - DAIS.x, z - DAIS.z) < DAIS.radius - 0.05;
        });
      });
    const others = places.filter((place) => place !== command);
    others.forEach((from) => others.forEach((to) => expect(crossesDais(route(from, to)), `${from.join()} -> ${to.join()}`).toBe(false)));
    others.forEach((to) => expect(route(command, to).at(-1)).toEqual(to));
  }, PAIRS_TIMEOUT_MS);

  it('goes straight when nothing is in the way', () => {
    const a: Vec3 = [0, 0.2, -4];
    const b: Vec3 = [0, 0.2, -9];
    expect(route(a, b)).toEqual([a, b]);
  });
});
