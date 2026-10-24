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

/** Local date and time, "Oct 24, 2026, 12:00". */
export function formatDateTime(at: string | number | Date, language: string): string {
  return new Date(at).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A file size in kilobytes, "1.5 kB"; anything not empty shows at least 0.1. */
export function formatSize(bytes: number, language: string): string {
  const kilobytes = bytes > 0 ? Math.max(bytes / 1024, 0.1) : 0;
  return new Intl.NumberFormat(language, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 1 }).format(kilobytes);
}
