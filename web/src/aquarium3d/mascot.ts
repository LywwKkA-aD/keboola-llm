/**
 * Shape of the Keboola-style octopus in local units (1 unit ~ head width / 1.2):
 * a tall bulb head, two raised arms and four legs, seen from the front like the logo.
 * Pure data so it can be tested without WebGL.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export const BRAND_BLUE = '#228dff';

export const HEAD = { radius: 0.62, height: 1.55, bottom: 0.1, tube: 0.085 } as const;

// A circle stretched upwards, pinched at the bottom so the crown is the widest part.
const bulb = (s: number) => Math.sin(s * Math.PI) * (0.55 + 0.45 * Math.pow(s, 0.6));
const BULB_MAX = Math.max(...Array.from({ length: 1001 }, (_, i) => bulb(i / 1000)));

/** Lathe profile (radius, y) from the bottom pole to the top pole: narrow chin, full rounded crown. */
export function headProfile(steps = 40): Vec2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const s = i / steps; // 0 bottom -> 1 top
    const radius = (HEAD.radius * bulb(s)) / BULB_MAX;
    const y = HEAD.bottom + (1 - Math.cos(s * Math.PI)) * 0.5 * HEAD.height;
    return [Math.max(0, radius), y] as const;
  });
}

export interface Tentacle {
  readonly kind: 'arm' | 'leg';
  /** Direction around the body (radians, 0 = +x / viewer's right). */
  readonly azimuth: number;
  /** Phase offset so tentacles do not move in lockstep. */
  readonly phase: number;
}

export const TENTACLES: readonly Tentacle[] = [
  { kind: 'arm', azimuth: 0, phase: 0 },
  { kind: 'arm', azimuth: Math.PI, phase: Math.PI },
  { kind: 'leg', azimuth: Math.PI * 0.2, phase: 0.8 },
  { kind: 'leg', azimuth: Math.PI * 0.8, phase: 2.1 },
  { kind: 'leg', azimuth: Math.PI * 1.25, phase: 3.3 },
  { kind: 'leg', azimuth: Math.PI * 1.75, phase: 4.6 },
];

/** The hub under the head where the tentacles meet: it closes the narrow chin of the bulb. */
export const HUB = { y: 0.14, radius: 0.22, squash: 0.8 } as const;

/** Radius of the head at height y (0 below or above it), read off the lathe profile. */
export function headRadiusAt(y: number): number {
  const profile = headProfile();
  const upper = profile.findIndex(([, py]) => py >= y);
  if (upper <= 0) return 0;
  const [r0, y0] = profile[upper - 1] as Vec2;
  const [r1, y1] = profile[upper] as Vec2;
  return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
}

/**
 * Points along one tentacle (root -> tip), in the octopus' local space. Every root sits inside the head, so the
 * tentacle grows out of it instead of hanging under it with a gap.
 */
export function tentaclePath({ kind, azimuth }: Tentacle): Vec3[] {
  const dir = (r: number, y: number): Vec3 => [Math.cos(azimuth) * r, y, -Math.sin(azimuth) * r];
  if (kind === 'arm') {
    // Out of the side of the chin, then up like raised hands.
    return [dir(0.08, 0.3), dir(0.35, 0.12), dir(0.62, 0.02), dir(0.85, 0.2), dir(0.95, 0.52)];
  }
  // Down and out of the chin, curling outward at the tip.
  return [dir(0.05, 0.3), dir(0.16, 0.0), dir(0.34, -0.34), dir(0.53, -0.72), dir(0.78, -1.0)];
}

/**
 * How far the bend shader (tentacleMaterial.ts) moves the tip at time t, so the tip cap can follow it. Must match the
 * shader for aT = 1.
 */
export function tipOffset({ t, speed, amp, phase, bend }: { t: number; speed: number; amp: number; phase: number; bend: Vec3 }): Vec3 {
  const wave = Math.sin(t * speed + 3.6 + phase) * amp * 5;
  const lift = Math.cos(t * speed * 0.7 + 2.2 + phase) * amp * 1.6;
  return [bend[0] * wave, bend[1] * wave + lift, bend[2] * wave];
}
