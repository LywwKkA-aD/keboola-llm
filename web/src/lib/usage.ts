/** The share of prompt tokens read from the prompt cache; undefined before any call. */
export const cacheShare = ({ input, cached }: { readonly input: number; readonly cached: number }): number | undefined =>
  input > 0 ? cached / input : undefined;

/** "87%", "<1%" for a share that is not zero but rounds to it, "—" for none. Never rounds up to a full 100%. */
export function formatShare(share: number | undefined): string {
  if (share === undefined) return '—';
  if (share > 0 && share < 0.005) return '<1%';
  return `${share >= 1 ? 100 : Math.min(Math.round(share * 100), 99)}%`;
}

/** The smallest of 1, 2, 5 x 10^n at or above `value`: a clean top for the chart's scale. */
export function scaleMax(value: number): number {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].map((step) => step * power).find((top) => top >= value) ?? 10 * power);
}

/** "04.10" (ru) or "10/04" (en) for a YYYY-MM-DD day. */
export function shortDate(date: string, language: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(language, { day: '2-digit', month: '2-digit' });
}
