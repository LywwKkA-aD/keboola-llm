import { describe, expect, it } from 'vitest';
import { DAIS, route, rackPlacements, RACK } from './floorplan.ts';
import type { Vec3 } from './mascot.ts';
import { BRIEFING_SPOTS, briefingSpot, INSPECT_SPOTS, MEETING_POINTS, pastimes, SHIFT_MS, STROLL_PATHS } from './pastimes.ts';

const names = Array.from({ length: 12 }, (_, i) => `agent-${i}`);
const flat = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[2]! - q[2]!);

const insideRack = ([x, , z]: Vec3) =>
  rackPlacements().some(({ position: [rx, , rz] }) => Math.abs(x - rx) < RACK.depth / 2 + 0.3 && Math.abs(z - rz) < RACK.width / 2 + 0.3);

describe('pastime places', () => {
  it('keeps every place clear of the racks and reachable without walking through one', () => {
    const places = [...INSPECT_SPOTS.map((spot) => spot.position), ...MEETING_POINTS, ...STROLL_PATHS.flat(), ...BRIEFING_SPOTS.map((spot) => spot.position)];
    places.forEach((place) => expect(insideRack(place), place.join(',')).toBe(false));
    places.forEach((place) => expect(route([0, 0.2, 1.8], place).length).toBeGreaterThan(1));
  });

  it('puts an inspecting agent right in front of a rack face, looking at it', () => {
    INSPECT_SPOTS.forEach(({ position, facing }) => {
      const ahead: Vec3 = [position[0] + Math.sin(facing) * 0.75, position[1], position[2] + Math.cos(facing) * 0.75];
      expect(insideRack(ahead), position.join(',')).toBe(true);
    });
  });
});

describe('pastimes', () => {
  const at = 1_000_000;

  it('gives every resting agent a pastime: a rack to look at, a group to talk in or a slow walk', () => {
    const plans = pastimes(names, at);
    expect(Object.keys(plans).toSorted()).toEqual(names.toSorted());
    const kinds = new Set(Object.values(plans).map((plan) => plan.pastime));
    expect(kinds).toEqual(new Set(['inspect', 'chat', 'stroll']));
  });

  it('never leaves anyone talking alone and turns a group toward its middle', () => {
    const plans = pastimes(names, at);
    const talking = names.filter((name) => plans[name]?.pastime === 'chat');
    MEETING_POINTS.forEach((point) => {
      const group = talking.filter((name) => flat(plans[name]!.position, point) < 1.5);
      expect(group.length === 0 || group.length >= 2).toBe(true);
      group.forEach((name) => {
        const { position, facing } = plans[name]!;
        const toMiddle = Math.atan2(point[0] - position[0], point[2] - position[2]);
        expect(Math.cos(facing - toMiddle)).toBeGreaterThan(0.99);
      });
    });
  });

  it('keeps everyone apart, strollers included, and talkers far enough that their arms do not cross', () => {
    for (let t = 0; t < 6 * SHIFT_MS; t += 7_000) {
      const plans = Object.values(pastimes(names, at + t));
      plans.forEach((p, i) => plans.slice(i + 1).forEach((q) => expect(flat(p.position, q.position)).toBeGreaterThan(p.pastime === 'chat' && q.pastime === 'chat' ? 1.2 : 0.85)));
    }
  });

  it('keeps groups off the lead\'s dais and away from the front corridors', () => {
    for (let t = 0; t < 6 * SHIFT_MS; t += 7_000) {
      Object.values(pastimes(names, at + t))
        .filter((plan) => plan.pastime === 'chat')
        .forEach(({ position: [x, , z] }) => {
          expect(Math.hypot(x - DAIS.x, z - DAIS.z)).toBeGreaterThan(DAIS.radius + 0.4);
          expect(z).toBeGreaterThan(-1.2 + 0.8);
          expect(z).toBeLessThan(4.4 - 0.8);
        });
    }
  });

  it('walks a stroller slowly between the ends of its path', () => {
    const strolls = (t: number) => Object.entries(pastimes(names, t)).filter(([, plan]) => plan.pastime === 'stroll');
    const [name, plan] = strolls(at)[0]!;
    expect(plan.pace).toBeLessThan(1.2);
    const ends = new Set<string>();
    for (let t = 0; t < 40_000; t += 1_000) {
      const later = pastimes(names, at + t)[name];
      if (later?.pastime === 'stroll') ends.add(later.position.join(','));
    }
    expect(ends.size).toBe(2);
  });

  it('changes pastimes now and then, a few agents at a time', () => {
    const before = pastimes(names, at);
    const soon = pastimes(names, at + 5_000);
    const moved = names.filter((name) => before[name]!.pastime !== 'stroll' && soon[name]!.position.join() !== before[name]!.position.join());
    expect(moved.length).toBeLessThanOrEqual(4);
    const later = pastimes(names, at + 3 * SHIFT_MS);
    expect(names.some((name) => later[name]!.pastime !== before[name]!.pastime)).toBe(true);
  });

  it('is deterministic', () => {
    expect(pastimes(names, at)).toEqual(pastimes(names, at));
  });
});

describe('briefingSpot', () => {
  it('stands a new delegate at the dais, facing the lead, each in its own place', () => {
    const spots = [0, 1, 2, 3].map(briefingSpot);
    spots.forEach(({ position, facing }) => {
      const toLead = Math.atan2(0 - position[0], 1.8 - position[2]);
      expect(Math.cos(facing - toLead)).toBeGreaterThan(0.99);
    });
    spots.forEach((p, i) => spots.slice(i + 1).forEach((q) => expect(flat(p.position, q.position)).toBeGreaterThan(0.9)));
  });
});
