import { describe, expect, it } from 'vitest';
import { coralBranches, crystalCluster, rockOffset, seeded } from './nature.ts';

describe('seeded', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = seeded(42);
    const b = seeded(42);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    values.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });
});

describe('coralBranches', () => {
  const branches = coralBranches(7, 4);

  it('grows from the base upward and thins out toward the tips', () => {
    expect(branches[0]?.start).toEqual([0, 0, 0]);
    const trunk = branches[0]!;
    const tips = branches.filter((branch) => branch.tip);
    expect(tips.length).toBeGreaterThan(4);
    tips.forEach((tip) => {
      expect(tip.radius).toBeLessThan(trunk.radius);
      expect(tip.end[1]).toBeGreaterThan(0.5);
    });
  });

  it('connects every branch to the end of another one', () => {
    branches.slice(1).forEach((branch) => {
      expect(branches.some((other) => other !== branch && other.end.every((v, i) => Math.abs(v - (branch.start[i] ?? 0)) < 1e-9))).toBe(true);
    });
  });

  it('is the same for the same seed', () => {
    expect(coralBranches(7, 4)).toEqual(branches);
  });
});

describe('crystalCluster', () => {
  it('points crystals upward and outward with varied sizes', () => {
    const crystals = crystalCluster(3, 9);
    expect(crystals).toHaveLength(9);
    crystals.forEach((crystal) => {
      expect(crystal.direction[1]).toBeGreaterThan(0.3);
      expect(Math.hypot(...crystal.direction)).toBeCloseTo(1);
    });
    expect(new Set(crystals.map((c) => c.length.toFixed(2))).size).toBeGreaterThan(3);
  });
});

describe('rockOffset', () => {
  it('bumps the surface a little, the same way every time', () => {
    const offset = rockOffset([0.3, 0.8, -0.5], 5);
    expect(Math.abs(offset)).toBeLessThan(0.35);
    expect(rockOffset([0.3, 0.8, -0.5], 5)).toBe(offset);
    expect(rockOffset([0.3, 0.8, -0.5], 6)).not.toBe(offset);
  });
});
