/** "900 B", "2.1 KB", "3.0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Local short date and time of an ISO timestamp; the raw text when it is not a date. */
export function formatWhen(iso: string, language: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return new Date(at).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' });
}
