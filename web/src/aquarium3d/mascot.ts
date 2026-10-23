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

/** Points along one tentacle (root under the head -> tip), in the octopus' local space. */
export function tentaclePath({ kind, azimuth }: Tentacle): Vec3[] {
  const dir = (r: number, y: number): Vec3 => [Math.cos(azimuth) * r, y, -Math.sin(azimuth) * r];
  if (kind === 'arm') {
    // Out to the side under the head, then up like raised hands.
    return [dir(0.22, 0.12), dir(0.55, 0.0), dir(0.82, 0.18), dir(0.95, 0.52)];
  }
  // Down and out, curling outward at the tip.
  return [dir(0.12, 0.05), dir(0.32, -0.32), dir(0.52, -0.72), dir(0.78, -1.0)];
}
