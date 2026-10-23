import { describe, expect, it } from 'vitest';
import { layout3d, STATIONS_3D, stationSlots } from './layout3d.ts';
import { auraFor } from './status.ts';

const names = ['lead', 'a', 'b', 'c', 'd'];
const dist = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

describe('layout3d', () => {
  it('keeps the lead on the command deck and rests the others on the reef, apart from each other', () => {
    const spots = layout3d({ names, lead: 'lead', moods: {} });
    expect(spots.lead?.position).toEqual(STATIONS_3D.command.position);
    const reef = ['a', 'b', 'c', 'd'].map((name) => spots[name]!.position);
    reef.forEach((p, i) => reef.slice(i + 1).forEach((q) => expect(dist(p, q)).toBeGreaterThan(1)));
    reef.forEach((p) => expect(p[2]).toBeLessThan(0));
  });

  it('sends busy agents to their station and spreads agents sharing one', () => {
    const spots = layout3d({ names, lead: 'lead', moods: { a: 'computing', b: 'querying', c: 'reading' } });
    expect(dist(spots.c!.position, STATIONS_3D.archive.position)).toBeLessThan(0.01);
    expect(dist(spots.a!.position, STATIONS_3D.console.position)).toBeLessThan(2);
    expect(dist(spots.a!.position, spots.b!.position)).toBeGreaterThan(1);
  });

  it('turns agents at a station to face it', () => {
    const spots = layout3d({ names, lead: 'lead', moods: { a: 'writing' } });
    expect(spots.a!.facing).toBeCloseTo(STATIONS_3D.forge.facing);
  });

  it('keeps thinking agents where they rest and sends waiting ones to the beacon', () => {
    const resting = layout3d({ names, lead: 'lead', moods: {} });
    const spots = layout3d({ names, lead: 'lead', moods: { a: 'thinking', b: 'waiting' } });
    expect(spots.a!.position).toEqual(resting.a!.position);
    expect(dist(spots.b!.position, STATIONS_3D.beacon.position)).toBeLessThan(0.01);
  });

  it('seats agents at the Keboola workstations one per desk, never on top of each other', () => {
    const many = ['lead', 'a', 'b', 'c', 'd'];
    const spots = layout3d({ names: many, lead: 'lead', moods: { a: 'computing', b: 'querying', c: 'computing', d: 'querying' } });
    const desks = stationSlots('console');
    expect(desks).toHaveLength(3);
    ['a', 'b', 'c'].forEach((name) => expect(desks.some((desk) => dist(desk, spots[name]!.position) < 1e-9)).toBe(true));
    const positions = ['a', 'b', 'c', 'd'].map((name) => spots[name]!.position);
    positions.forEach((p, i) => positions.slice(i + 1).forEach((q) => expect(dist(p, q)).toBeGreaterThan(1)));
  });

  it('gives agents waiting for approval their own pads at the waiting area', () => {
    const spots = layout3d({ names, lead: 'lead', moods: { a: 'waiting', b: 'waiting' } });
    const pads = stationSlots('beacon');
    expect(pads.length).toBeGreaterThanOrEqual(3);
    expect(dist(spots.a!.position, pads[0]!)).toBeLessThan(1e-9);
    expect(dist(spots.b!.position, pads[1]!)).toBeLessThan(1e-9);
  });

  it('places many resting agents without collisions', () => {
    const many = Array.from({ length: 24 }, (_, i) => `agent-${i}`);
    const spots = layout3d({ names: many, lead: 'agent-0', moods: {} });
    const reef = many.slice(1).map((name) => spots[name]!.position);
    reef.forEach((p, i) => reef.slice(i + 1).forEach((q) => expect(dist(p, q)).toBeGreaterThan(0.9)));
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
