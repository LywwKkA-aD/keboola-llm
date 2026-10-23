import { describe, expect, it } from 'vitest';
import { resolveAppearance } from './appearance.ts';

const media = (light: boolean, reduce: boolean) => (query: string) =>
  query.includes('prefers-color-scheme: light') ? light : query.includes('prefers-reduced-motion') ? reduce : false;

describe('resolveAppearance', () => {
  it('uses explicit choices as they are', () => {
    expect(resolveAppearance({ theme: 'light', reduceMotion: 'on' }, media(false, false))).toEqual({ theme: 'light', reducedMotion: true });
    expect(resolveAppearance({ theme: 'dark', reduceMotion: 'off' }, media(true, true))).toEqual({ theme: 'dark', reducedMotion: false });
  });

  it('follows the operating system for "system"', () => {
    expect(resolveAppearance({ theme: 'system', reduceMotion: 'system' }, media(true, true))).toEqual({ theme: 'light', reducedMotion: true });
    expect(resolveAppearance({ theme: 'system', reduceMotion: 'system' }, media(false, false))).toEqual({ theme: 'dark', reducedMotion: false });
  });
});
