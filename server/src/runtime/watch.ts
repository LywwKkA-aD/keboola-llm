import { existsSync, watch as fsWatch } from 'node:fs';

export type WatchFn = (path: string, listener: () => void) => { close(): void };

const defaultWatch: WatchFn = (path, listener) => fsWatch(path, { recursive: true }, listener);

/**
 * Watch folders (recursively) and call back once a burst of changes has settled, e.g. after
 * agent-builder writes an AGENT.md. Missing folders are skipped. Returns a stop function.
 */
export function watchFolders(paths: readonly string[], onChange: () => void, { debounceMs, watch = defaultWatch }: { debounceMs: number; watch?: WatchFn }): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, debounceMs);
  };
  const watchers = paths.filter((path) => existsSync(path)).map((path) => watch(path, schedule));
  return () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    watchers.forEach((watcher) => watcher.close());
  };
}
