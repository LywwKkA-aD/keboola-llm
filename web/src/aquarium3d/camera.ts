import type { Vec3 } from './mascot.ts';

/** Overview pose tuned for a wide (16:10) viewport. */
export const OVERVIEW = { position: [0, 8.2, 17.5] as Vec3, target: [0, 0.4, 0.2] as Vec3 } as const;

// Below this aspect the outer stations (x ~ +-9.5) would leave the frame.
const DESIGN_ASPECT = 1.3;
const MAX_PULL_BACK = 1.6;

/**
 * Overview pose for any viewport: narrower views pull the camera back along its line of sight
 * so the whole reef (all stations) still fits horizontally.
 */
export function overviewPose(aspect: number): { position: Vec3; target: Vec3 } {
  const factor = Math.min(MAX_PULL_BACK, Math.max(1, DESIGN_ASPECT / Math.max(aspect, 0.1)));
  const [tx, ty, tz] = OVERVIEW.target;
  const [px, py, pz] = OVERVIEW.position;
  return {
    position: [tx + (px - tx) * factor, ty + (py - ty) * factor, tz + (pz - tz) * factor],
    target: OVERVIEW.target,
  };
}
