import { existsSync, readdirSync, statSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';

export type WatchFn = (path: string, listener: () => void) => { close(): void };

const defaultWatch: WatchFn = (path, listener) => fsWatch(path, { recursive: true }, listener);

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
  { debounceMs, watch = defaultWatch, pollMs }: { debounceMs: number; watch?: WatchFn; pollMs?: number },
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
  const watchers = paths.filter((path) => existsSync(path)).map((path) => watch(path, schedule));
  const poll = pollMs
    ? setInterval(() => {
        if (timer) return;
        const now = folderSignature(paths);
        if (now !== seen) schedule();
      }, pollMs)
    : undefined;
  return () => {
    if (timer) clearTimeout(timer);
    if (poll) clearInterval(poll);
    timer = undefined;
    watchers.forEach((watcher) => watcher.close());
  };
}
