import type { RackPlacement } from './floorplan.ts';
import type { Vec3 } from './mascot.ts';
import { seeded } from './nature.ts';

export interface Led {
  readonly position: Vec3;
  readonly rotation: number;
  readonly rate: number;
  readonly phase: number;
  readonly kind: 'blue' | 'green' | 'amber';
}

/** A column of status LEDs on the front face of each rack (the cold-aisle side), each blinking at its own rate. */
export function rackLeds(racks: readonly RackPlacement[], perRack: number): Led[] {
  const random = seeded(31415);
  return racks.flatMap((rack) =>
    Array.from({ length: perRack }, (_, i) => {
      // Front face is half a rack depth out, LEDs on the left third of it.
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
