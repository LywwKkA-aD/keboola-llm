import { describe, expect, it } from 'vitest';
import { OVERVIEW, overviewPose } from './camera.ts';

const distance = (pose: { position: readonly number[]; target: readonly number[] }) =>
  Math.hypot(...pose.position.map((value, i) => value - (pose.target[i] ?? 0)));

describe('overviewPose', () => {
  it('keeps the designed pose on wide viewports', () => {
    expect(overviewPose(1.6)).toEqual({ position: OVERVIEW.position, target: OVERVIEW.target });
    expect(overviewPose(2.4)).toEqual({ position: OVERVIEW.position, target: OVERVIEW.target });
  });

  it('pulls back along the same line of sight on narrow viewports, within a limit', () => {
    const wide = overviewPose(1.6);
    const narrow = overviewPose(0.9);
    expect(distance(narrow)).toBeGreaterThan(distance(wide) * 1.35);
    expect(distance(overviewPose(0.2))).toBeCloseTo(distance(wide) * 1.6);
    expect(narrow.target).toEqual(wide.target);
  });
});
