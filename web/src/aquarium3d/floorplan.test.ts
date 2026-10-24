import { describe, expect, it } from 'vitest';
import { IDLE_SPOTS, RACK_ROWS, rackPlacements, route, STATION_SPOTS } from './floorplan.ts';
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

const places: Vec3[] = [...Object.values(STATION_SPOTS).flat(), ...IDLE_SPOTS.map((spot) => spot.position)];

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
    places.forEach((place) => expect(inRack(place)).toBe(false));
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
  });

  it('takes a reasonable way: never more than three times the straight distance plus a detour', () => {
    const from = STATION_SPOTS.archive[0] as Vec3;
    const to = STATION_SPOTS.console[0] as Vec3;
    const length = route(from, to).slice(1).reduce((sum, end, i, rest) => {
      const start = i === 0 ? from : (rest[i - 1] as Vec3);
      return sum + Math.hypot(end[0] - start[0], end[2] - start[2]);
    }, 0);
    expect(length).toBeLessThan(Math.hypot(to[0] - from[0], to[2] - from[2]) * 3 + 6);
  });

  it('goes straight when nothing is in the way', () => {
    const a: Vec3 = [0, 0.2, -4];
    const b: Vec3 = [0, 0.2, -9];
    expect(route(a, b)).toEqual([a, b]);
  });
});
