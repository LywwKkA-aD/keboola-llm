import { existsSync, readdirSync, statSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';

export type WatchFn = (path: string, listener: () => void, onError: (error: Error) => void) => { close(): void };

// Without an error listener a watcher's error (on Windows: EPERM when the watched folder is deleted) crashes the app.
export const defaultWatch: WatchFn = (path, listener, onError) => fsWatch(path, { recursive: true }, listener).on('error', onError);

/** Every file under the folders with its size and modification time: equal strings mean nothing changed. */
export function folderSignature(paths: readonly string[]): string {
  return paths
    .filter((path) => existsSync(path))
    .flatMap((path) =>
      readdirSync(path, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const file = join(entry.parentPath, entry.name);
          try {
            const { size, mtimeMs } = statSync(file);
            return `${file}:${size}:${mtimeMs}`;
          } catch {
            return `${file}:gone`;
          }
        }),
    )
    .toSorted()
    .join('\n');
}

/**
 * Watch folders (recursively) and call back once a burst of changes has settled, e.g. after
 * agent-builder writes an AGENT.md. Missing folders are skipped. Returns a stop function.
 * With pollMs the folders are also compared every pollMs: on Linux a recursive watcher can lose a folder that was
 * removed and made again and then never report its files.
 */
export function watchFolders(
  paths: readonly string[],
  onChange: () => void,
  { debounceMs, watch = defaultWatch, pollMs, log = (message) => console.warn(message) }: {
    debounceMs: number;
    watch?: WatchFn;
    pollMs?: number;
    log?: (message: string) => void;
  },
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seen = pollMs ? folderSignature(paths) : '';
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (pollMs) seen = folderSignature(paths);
      onChange();
    }, debounceMs);
  };
  const watchers = paths
    .filter((path) => existsSync(path))
    .map((path) => {
      const watcher = watch(path, schedule, (error) => {
        // The folder went away or cannot be watched any more: stop this watcher; polling (when on) carries on.
        log(`[watch] stopped watching ${path}: ${error.message}`);
        watcher.close();
        schedule();
      });
      return watcher;
    });
  const poll = pollMs
    ? setInterval(() => {
        if (timer) return;
        try {
          const now = folderSignature(paths);
          if (now !== seen) schedule();
        } catch (error) {
          // A folder removed between listing and reading it: compare again next time.
          log(`[watch] ${(error as Error).message}`);
        }
      }, pollMs)
    : undefined;
  return () => {
    if (timer) clearTimeout(timer);
    if (poll) clearInterval(poll);
    timer = undefined;
    watchers.forEach((watcher) => watcher.close());
  };
}
