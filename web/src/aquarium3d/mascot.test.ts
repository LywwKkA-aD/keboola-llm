import { describe, expect, it } from 'vitest';
import { HEAD, headProfile, headRadiusAt, HUB, TENTACLES, tentaclePath, tipOffset } from './mascot.ts';

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

  it('grows every tentacle out of the head, root inside it, and keeps the pairs mirrored', () => {
    TENTACLES.forEach((tentacle) => {
      const [root, next] = tentaclePath(tentacle);
      const radial = Math.hypot(root?.[0] ?? 0, root?.[2] ?? 0);
      expect(root?.[1]).toBeGreaterThan(HEAD.bottom);
      expect(radial).toBeLessThan(headRadiusAt(root?.[1] ?? 0));
      // The first stretch stays within the head or the hub under it (no gap where the skin meets).
      const middle = [((root?.[0] ?? 0) + (next?.[0] ?? 0)) / 2, ((root?.[1] ?? 0) + (next?.[1] ?? 0)) / 2, ((root?.[2] ?? 0) + (next?.[2] ?? 0)) / 2];
      const inHead = Math.hypot(middle[0]!, middle[2]!) < headRadiusAt(middle[1]!) + HEAD.tube;
      const inHub = Math.hypot(middle[0]!, (middle[1]! - HUB.y) / HUB.squash, middle[2]!) < HUB.radius + HEAD.tube;
      expect(inHead || inHub).toBe(true);
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

describe('headRadiusAt', () => {
  it('follows the profile and is zero outside the head', () => {
    expect(headRadiusAt(HEAD.bottom - 0.1)).toBe(0);
    expect(headRadiusAt(HEAD.bottom + HEAD.height + 0.1)).toBe(0);
    expect(headRadiusAt(HEAD.bottom + HEAD.height * 0.7)).toBeGreaterThan(HEAD.radius * 0.8);
  });
});

describe('tipOffset', () => {
  it('stays put without amplitude and moves along the bend and up with it', () => {
    tipOffset({ t: 1, speed: 2, amp: 0, phase: 0, bend: [1, 0, 0] }).forEach((value) => expect(value).toBeCloseTo(0));
    const [x, , z] = tipOffset({ t: 0, speed: 1, amp: 0.1, phase: -3.6 + Math.PI / 2, bend: [0, 0, 1] });
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(0.5);
  });
});
