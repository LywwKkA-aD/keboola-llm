/**
 * What the server checks before it starts, and closes when it stops, so a busy port or a second window gives a plain
 * message instead of a stack trace, and the checkpoint database is left complete.
 */
import { createServer } from 'node:net';

const STATUS_TIMEOUT_MS = 1500;

/** Whether something already listens on host:port. */
export function isPortTaken(host: string, port: number): Promise<boolean> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => (error.code === 'EADDRINUSE' ? done(true) : fail(error)));
    probe.listen(port, host, () => probe.close(() => done(false)));
  });
}

/** What to tell the user when the port is taken: Agent Studio already runs there, or another program uses it. */
export async function portTakenMessage(host: string, port: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const address = `http://${host}:${port}`;
  try {
    const response = await fetchImpl(`${address}/api/status`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    const body = (await response.json()) as { version?: unknown };
    if (response.ok && typeof body.version === 'string') {
      return `Agent Studio is already running at ${address}: open it in the browser, or close the other window (Ctrl+C) first.`;
    }
  } catch {
    // Not Agent Studio (or not answering): another program.
  }
  return `Port ${port} is used by another program. Start Agent Studio on another port: $env:PORT=${port + 1}; npm start (PowerShell) or PORT=${port + 1} npm start, then open http://${host}:${port + 1}.`;
}

/** The slice of the SQLite checkpointer needed to close it cleanly. */
export interface ClosableCheckpointer {
  readonly db?: { pragma(source: string): unknown; close(): void; readonly open?: boolean };
}

/** Fold the write-ahead log into the database file and close it, so a copy of the data folder is complete. */
export function closeCheckpointer(checkpointer: ClosableCheckpointer): void {
  const db = checkpointer.db;
  if (!db || db.open === false) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}
