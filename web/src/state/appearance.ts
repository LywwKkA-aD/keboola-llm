import type { Settings } from '../api/types.ts';

export interface Appearance {
  readonly theme: 'dark' | 'light';
  readonly reducedMotion: boolean;
}

export type MediaMatcher = (query: string) => boolean;

export const browserMedia: MediaMatcher = (query) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** Turn "system" choices into concrete values using the operating system preferences. */
export function resolveAppearance(settings: Pick<Settings, 'theme' | 'reduceMotion'>, matches: MediaMatcher = browserMedia): Appearance {
  const theme = settings.theme === 'system' ? (matches('(prefers-color-scheme: light)') ? 'light' : 'dark') : settings.theme;
  const reducedMotion =
    settings.reduceMotion === 'system' ? matches('(prefers-reduced-motion: reduce)') : settings.reduceMotion === 'on';
  return { theme, reducedMotion };
}

/** Reflect the appearance on <html> so CSS tokens and animations follow it. */
export function applyAppearance(root: HTMLElement, appearance: Appearance, language: string): void {
  root.dataset.theme = appearance.theme;
  root.dataset.motion = appearance.reducedMotion ? 'reduce' : 'full';
  root.lang = language;
}
