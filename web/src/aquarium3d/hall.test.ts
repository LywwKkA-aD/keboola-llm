import { describe, expect, it } from 'vitest';
import { RACK_ROWS, rackPlacements } from './floorplan.ts';
import { rackLeds } from './hall.ts';

describe('rackLeds', () => {
  it('puts a column of LEDs on the aisle-facing front of every rack, each with its own rhythm', () => {
    const racks = rackPlacements();
    const leds = rackLeds(racks, 6);
    expect(leds).toHaveLength(racks.length * 6);
    expect(new Set(leds.map((led) => led.rate.toFixed(3))).size).toBeGreaterThan(20);
    racks.forEach((rack, r) => {
      const row = RACK_ROWS.find((candidate) => Math.abs(candidate.x - rack.position[0]) < 1e-9);
      leds.slice(r * 6, r * 6 + 6).forEach((led) => {
        // On the front, toward the row's cold aisle, and above the floor.
        expect(Math.sign(led.position[0] - rack.position[0])).toBe(row?.front);
        expect(led.position[1]).toBeGreaterThan(rack.position[1]);
      });
    });
  });
});
