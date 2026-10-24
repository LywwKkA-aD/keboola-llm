import { describe, expect, it } from 'vitest';
import { cacheShare, formatShare, scaleMax, shortDate } from './usage.ts';

describe('usage helpers', () => {
  it('gives the share of prompt tokens read from the cache', () => {
    expect(cacheShare({ input: 1000, cached: 870 })).toBeCloseTo(0.87);
    expect(cacheShare({ input: 0, cached: 0 })).toBeUndefined();
  });

  it('formats a share as a whole percent, a dash when there is none', () => {
    expect(formatShare(0.874)).toBe('87%');
    expect(formatShare(0.996)).toBe('99%');
    expect(formatShare(1)).toBe('100%');
    expect(formatShare(0.004)).toBe('<1%');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(undefined)).toBe('—');
  });

  it('rounds the chart top up to a clean number', () => {
    expect(scaleMax(0)).toBe(0);
    expect(scaleMax(870)).toBe(1000);
    expect(scaleMax(1_240_000)).toBe(2_000_000);
    expect(scaleMax(3_100)).toBe(5_000);
    expect(scaleMax(20_000)).toBe(20_000);
  });

  it('shows a day as a short local date', () => {
    expect(shortDate('2026-10-04', 'ru')).toBe('04.10');
    expect(shortDate('2026-10-04', 'en')).toBe('10/04');
  });
});
