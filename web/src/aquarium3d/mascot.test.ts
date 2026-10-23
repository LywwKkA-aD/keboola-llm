import { describe, expect, it } from 'vitest';
import { HEAD, headProfile, TENTACLES, tentaclePath } from './mascot.ts';

describe('headProfile', () => {
  const profile = headProfile();

  it('runs from the bottom pole to the top pole on the axis', () => {
    expect(profile[0]?.[0]).toBeCloseTo(0);
    expect(profile.at(-1)?.[0]).toBeCloseTo(0);
    expect(profile[0]?.[1]).toBeLessThan(profile.at(-1)?.[1] ?? 0);
  });

  it('is widest in the upper part, like a bulb', () => {
    const widest = profile.reduce((best, point) => (point[0] > best[0] ? point : best));
    expect(widest[0]).toBeCloseTo(HEAD.radius, 1);
    expect(widest[1]).toBeGreaterThan(HEAD.height * 0.5);
  });

  it('never goes negative in radius and rises monotonically', () => {
    profile.forEach(([radius]) => expect(radius).toBeGreaterThanOrEqual(0));
    profile.slice(1).forEach(([, y], i) => expect(y).toBeGreaterThan(profile[i]?.[1] ?? -Infinity));
  });
});

describe('tentacles', () => {
  it('has two raised arms and four legs, like the logo', () => {
    expect(TENTACLES.filter((t) => t.kind === 'arm')).toHaveLength(2);
    expect(TENTACLES.filter((t) => t.kind === 'leg')).toHaveLength(4);
  });

  it('starts every tentacle under the head and keeps the pairs mirrored', () => {
    TENTACLES.forEach((tentacle) => {
      const [root] = tentaclePath(tentacle);
      expect(root?.[1]).toBeLessThan(HEAD.bottom + 0.05);
    });
    const [left, right] = TENTACLES.filter((t) => t.kind === 'arm').map((t) => tentaclePath(t));
    expect(left?.at(-1)?.[0]).toBeCloseTo(-(right?.at(-1)?.[0] ?? 0));
  });

  it('raises arms above their roots and lets legs hang below', () => {
    TENTACLES.forEach((tentacle) => {
      const path = tentaclePath(tentacle);
      const rise = (path.at(-1)?.[1] ?? 0) - (path[0]?.[1] ?? 0);
      if (tentacle.kind === 'arm') expect(rise).toBeGreaterThan(0);
      else expect(rise).toBeLessThan(0);
    });
  });
});
