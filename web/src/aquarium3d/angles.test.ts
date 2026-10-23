import { describe, expect, it } from 'vitest';
import { dampAngle } from './angles.ts';

describe('dampAngle', () => {
  it('moves toward the target', () => {
    const next = dampAngle(0, 1, 2, 0.1);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it('crosses the PI seam the short way', () => {
    const next = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 5, 0.1);
    expect(next).toBeGreaterThan(Math.PI - 0.1);
  });

  it('reaches the target with a large step', () => {
    expect(dampAngle(0.5, 1, 100, 1)).toBeCloseTo(1);
  });
});
