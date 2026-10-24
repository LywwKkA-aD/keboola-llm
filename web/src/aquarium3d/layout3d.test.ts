import { describe, expect, it } from 'vitest';
import { IDLE_SPOTS, STATION_SPOTS } from './floorplan.ts';
import { layout3d, STATIONS_3D, stationSlots } from './layout3d.ts';
import { auraFor } from './status.ts';

const names = ['lead', 'a', 'b', 'c', 'd'];
const dist = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const apart = (positions: readonly (readonly number[])[], min: number) =>
  positions.forEach((p, i) => positions.slice(i + 1).forEach((q) => expect(dist(p, q)).toBeGreaterThan(min)));

describe('layout3d', () => {
  it('keeps the lead at the command dais and rests the others in the aisles, in order', () => {
    const spots = layout3d({ names, lead: 'lead', moods: {} });
    expect(spots.lead?.position).toEqual(STATIONS_3D.command.position);
    ['a', 'b', 'c', 'd'].forEach((name, i) => expect(spots[name]).toEqual(IDLE_SPOTS[i]));
  });

  it('sends busy agents to the station of their work, one place each', () => {
    const spots = layout3d({ names, lead: 'lead', moods: { a: 'computing', b: 'querying', c: 'reading', d: 'writing' } });
    expect([spots.a?.position, spots.b?.position]).toEqual(STATION_SPOTS.console.slice(0, 2));
    expect(spots.c?.position).toEqual(STATION_SPOTS.archive[0]);
    expect(spots.d?.position).toEqual(STATION_SPOTS.forge[0]);
    expect(spots.d?.facing).toBeCloseTo(STATIONS_3D.forge.facing);
  });

  it('sends agents waiting for approval to the checkpoint, each on its own pad', () => {
    const spots = layout3d({ names, lead: 'lead', moods: { a: 'waiting', b: 'waiting' } });
    expect([spots.a?.position, spots.b?.position]).toEqual(stationSlots('beacon').slice(0, 2));
  });

  it('queues agents behind a full station instead of stacking them', () => {
    const many = ['lead', 'a', 'b', 'c', 'd', 'e'];
    const spots = layout3d({ names: many, lead: 'lead', moods: { a: 'computing', b: 'computing', c: 'computing', d: 'computing', e: 'querying' } });
    apart(['a', 'b', 'c', 'd', 'e'].map((name) => spots[name]!.position), 0.9);
  });

  it('places many resting agents without collisions', () => {
    const many = Array.from({ length: 30 }, (_, i) => `agent-${i}`);
    const spots = layout3d({ names: many, lead: 'agent-0', moods: {} });
    apart(many.slice(1).map((name) => spots[name]!.position), 0.8);
  });
});

describe('auraFor', () => {
  it('stays calm at rest and turns warm when waiting or failing', () => {
    expect(auraFor('idle').intensity).toBeLessThan(auraFor('thinking').intensity);
    expect(auraFor('waiting').color).not.toBe(auraFor('computing').color);
    expect(auraFor('error').color).not.toBe(auraFor('waiting').color);
    expect(auraFor('computing').tentacleSpeed).toBeGreaterThan(auraFor('idle').tentacleSpeed);
  });
});
