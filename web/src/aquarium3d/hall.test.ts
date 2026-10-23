import { describe, expect, it } from 'vitest';
import { hallRacks, rackLeds } from './hall.ts';
import { reefSpot } from './layout3d.ts';

describe('hallRacks', () => {
  const racks = hallRacks();

  it('lines the hall with racks behind the docks, all facing the centre', () => {
    expect(racks.length).toBeGreaterThan(20);
    racks.forEach((rack) => {
      const radius = Math.hypot(rack.position[0], rack.position[2] - 0.5);
      expect(radius).toBeGreaterThan(12);
      const facing = Math.atan2(-rack.position[0], -(rack.position[2] - 0.5));
      expect(Math.abs(Math.atan2(Math.sin(rack.rotation - facing), Math.cos(rack.rotation - facing)))).toBeLessThan(0.01);
    });
  });

  it('keeps racks apart and clear of the resting docks', () => {
    racks.forEach((rack, i) =>
      racks.slice(i + 1).forEach((other) => {
        expect(Math.hypot(rack.position[0] - other.position[0], rack.position[2] - other.position[2])).toBeGreaterThan(0.9);
      }),
    );
    const dock = reefSpot(0).position;
    racks.forEach((rack) => expect(Math.hypot(rack.position[0] - dock[0], rack.position[2] - dock[2])).toBeGreaterThan(1.5));
  });
});

describe('rackLeds', () => {
  it('puts a column of LEDs on the front of every rack with its own blink rhythm', () => {
    const leds = rackLeds(hallRacks().slice(0, 2), 6);
    expect(leds).toHaveLength(12);
    expect(new Set(leds.map((led) => led.rate.toFixed(3))).size).toBeGreaterThan(4);
    // Above the floor (y = -0.6), on the rack front.
    leds.forEach((led) => expect(led.position[1]).toBeGreaterThan(-0.6));
  });
});
