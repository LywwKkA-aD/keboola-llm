/** "240 ms", "1.3 s", "2 min 5 s"; empty for unknown or negative durations. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** "950", "12.3k", "2.5M". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

/** Local wall-clock time, "21:20". */
export function formatClock(at: number | Date, language: string): string {
  return new Date(at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
}
