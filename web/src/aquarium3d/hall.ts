import type { Vec3 } from './mascot.ts';
import { seeded } from './nature.ts';

export interface Rack {
  readonly position: Vec3;
  /** Yaw so the rack's front faces the centre of the hall. */
  readonly rotation: number;
  readonly height: number;
}

export interface Led {
  readonly position: Vec3;
  readonly rotation: number;
  readonly rate: number;
  readonly phase: number;
  readonly kind: 'blue' | 'green' | 'amber';
}

const CENTER_Z = 0.5;
const ROWS = [
  { radius: 13.5, from: Math.PI * 1.08, to: Math.PI * 1.92, count: 22 },
  { radius: 16.5, from: Math.PI * 1.1, to: Math.PI * 1.9, count: 26 },
] as const;
const FLOOR = -0.6;

/** Server racks lining the back of the hall in two arcs, behind the docks where agents rest. */
export function hallRacks(): Rack[] {
  const random = seeded(2718);
  return ROWS.flatMap((row, rowIndex) =>
    Array.from({ length: row.count }, (_, i) => {
      const angle = row.from + ((row.to - row.from) * (i + 0.5)) / row.count;
      const x = Math.cos(angle) * row.radius;
      const z = CENTER_Z + Math.sin(angle) * row.radius;
      return {
        position: [x, FLOOR, z] as Vec3,
        rotation: Math.atan2(-x, -(z - CENTER_Z)),
        height: 2.6 + rowIndex * 0.3 + random() * 0.2,
      };
    }),
  );
}

/** A column of status LEDs on the front face of each rack, each blinking at its own rate. */
export function rackLeds(racks: readonly Rack[], perRack: number): Led[] {
  const random = seeded(31415);
  return racks.flatMap((rack) =>
    Array.from({ length: perRack }, (_, i) => {
      // Front face is half a rack depth toward the centre, LEDs on the left third of it.
      const forward = 0.51;
      const side = -0.22 + (i % 2) * 0.08;
      const x = rack.position[0] + Math.sin(rack.rotation) * forward + Math.cos(rack.rotation) * side;
      const z = rack.position[2] + Math.cos(rack.rotation) * forward - Math.sin(rack.rotation) * side;
      const y = rack.position[1] + 0.35 + (i / perRack) * (rack.height - 0.6);
      const roll = random();
      return {
        position: [x, y, z] as Vec3,
        rotation: rack.rotation,
        rate: 0.4 + random() * 2.6,
        phase: random() * Math.PI * 2,
        kind: roll > 0.92 ? 'amber' : roll > 0.6 ? 'green' : 'blue',
      };
    }),
  );
}
