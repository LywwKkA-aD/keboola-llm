import { describe, expect, it } from 'vitest';
import { seeded } from './nature.ts';

describe('seeded', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = seeded(42);
    const b = seeded(42);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    values.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });
});
