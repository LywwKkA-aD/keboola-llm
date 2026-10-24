import type { Vec3 } from './mascot.ts';

/** Overview pose for a wide (16:10) viewport: a three-quarter view from the front-right corner over the hall. */
export const OVERVIEW = { position: [12.5, 21.5, 15] as Vec3, target: [0.4, -0.8, -3.6] as Vec3 } as const;

// Below this aspect the side walls (x ~ +-12.9) would leave the frame.
const DESIGN_ASPECT = 1.45;
const MAX_PULL_BACK = 1.6;

/**
 * Overview pose for any viewport: narrower views pull the camera back along its line of sight
 * so the whole hall (all stations) still fits horizontally.
 */
export function overviewPose(aspect: number): { position: Vec3; target: Vec3 } {
  const factor = Math.min(MAX_PULL_BACK, Math.max(1, DESIGN_ASPECT / Math.max(aspect, 0.1)));
  if (factor === 1) return { position: OVERVIEW.position, target: OVERVIEW.target };
  const [tx, ty, tz] = OVERVIEW.target;
  const [px, py, pz] = OVERVIEW.position;
  return {
    position: [tx + (px - tx) * factor, ty + (py - ty) * factor, tz + (pz - tz) * factor],
    target: OVERVIEW.target,
  };
}
