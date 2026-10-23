import { describe, expect, it } from 'vitest';
import { layoutAgents, SCENE, STATIONS } from './layout.ts';

const names = ['lead', 'a', 'b', 'c'];

describe('layoutAgents', () => {
  it('keeps the lead at its desk and resting agents in distinct lounge spots', () => {
    const positions = layoutAgents({ names, lead: 'lead', moods: {} });
    expect(positions.lead).toEqual(STATIONS.desk);
    const lounge = ['a', 'b', 'c'].map((name) => positions[name]);
    expect(new Set(lounge.map((p) => `${p?.x},${p?.y}`)).size).toBe(3);
    lounge.forEach((p) => {
      expect(p?.y).toBeGreaterThan(STATIONS.computers.y);
      expect(p?.x).toBeGreaterThan(0);
      expect(p?.x).toBeLessThan(SCENE.width);
    });
  });

  it('sends busy agents to their station and spreads agents sharing one', () => {
    const positions = layoutAgents({ names, lead: 'lead', moods: { a: 'computing', b: 'querying', c: 'reading' } });
    expect(positions.c).toEqual(STATIONS.bookshelf);
    expect(positions.a?.y).toBe(STATIONS.computers.y);
    expect(positions.b?.y).toBe(STATIONS.computers.y);
    expect(positions.a?.x).not.toBe(positions.b?.x);
  });

  it('keeps thinking agents where they are resting', () => {
    const resting = layoutAgents({ names, lead: 'lead', moods: {} });
    const thinking = layoutAgents({ names, lead: 'lead', moods: { a: 'thinking' } });
    expect(thinking.a).toEqual(resting.a);
  });

  it('puts agents waiting for approval at the bell and writers at the workbench', () => {
    const positions = layoutAgents({ names, lead: 'lead', moods: { a: 'waiting', b: 'writing', lead: 'waiting' } });
    expect(positions.b).toEqual(STATIONS.workbench);
    expect(positions.a?.y).toBe(STATIONS.bell.y);
    expect(positions.lead?.y).toBe(STATIONS.bell.y);
  });

  it('wraps many resting agents into more than one row', () => {
    const many = Array.from({ length: 20 }, (_, i) => `agent-${i}`);
    const positions = layoutAgents({ names: many, lead: 'agent-0', moods: {} });
    const rows = new Set(many.slice(1).map((name) => positions[name]?.y));
    expect(rows.size).toBeGreaterThan(1);
  });
});
