import type { Vec3 } from './mascot.ts';

/** Small deterministic PRNG (mulberry32) so the reef looks the same on every load. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Branch {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly radius: number;
  readonly tip: boolean;
}

const normalize = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

/** A branching coral: each branch splits into 2-3 thinner, shorter ones that lean outward and up. */
export function coralBranches(seed: number, depth: number): Branch[] {
  const random = seeded(seed);
  const grow = (start: Vec3, direction: Vec3, length: number, radius: number, level: number): Branch[] => {
    const end: Vec3 = [start[0] + direction[0] * length, start[1] + direction[1] * length, start[2] + direction[2] * length];
    const tip = level >= depth;
    const branch: Branch = { start, end, radius, tip };
    if (tip) return [branch];
    const children = 2 + Math.floor(random() * 2);
    return [
      branch,
      ...Array.from({ length: children }, (_, i) => {
        const angle = (i / children) * Math.PI * 2 + random() * 1.2;
        const spread = 0.45 + random() * 0.35;
        const next = normalize([direction[0] + Math.cos(angle) * spread, direction[1] + 0.35, direction[2] + Math.sin(angle) * spread]);
        return grow(end, next, length * (0.72 + random() * 0.12), radius * 0.68, level + 1);
      }).flat(),
    ];
  };
  return grow([0, 0, 0], [0, 1, 0], 0.9, 0.16, 1);
}

export interface Crystal {
  readonly offset: Vec3;
  readonly direction: Vec3;
  readonly length: number;
  readonly radius: number;
  readonly phase: number;
}

/** A druse of hexagonal crystals fanning out of one rock. */
export function crystalCluster(seed: number, count: number): Crystal[] {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + random() * 0.6;
    const tilt = i === 0 ? 0 : 0.25 + random() * 0.55;
    const direction = normalize([Math.cos(angle) * tilt, 1, Math.sin(angle) * tilt]);
    return {
      offset: [Math.cos(angle) * 0.25 * tilt, 0, Math.sin(angle) * 0.25 * tilt],
      direction,
      length: i === 0 ? 2.6 : 0.9 + random() * 1.5,
      radius: i === 0 ? 0.32 : 0.12 + random() * 0.16,
      phase: random() * Math.PI * 2,
    };
  });
}

/** Smooth, seed-dependent bump for a point on a unit sphere: turns an icosphere into a rock. */
export function rockOffset([x, y, z]: Vec3, seed: number): number {
  const s = seed * 1.7;
  return (
    0.16 * Math.sin(x * 3.1 + s) * Math.cos(z * 2.7 - s) +
    0.09 * Math.sin(y * 5.3 + x * 2.1 + s * 2) +
    0.05 * Math.cos(z * 7.9 + y * 4.3 - s)
  );
}
