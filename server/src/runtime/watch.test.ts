import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { watchFolders, type WatchFn } from './watch.ts';

afterEach(() => {
  vi.useRealTimers();
});

function fakeWatch() {
  const listeners = new Map<string, () => void>();
  const closed: string[] = [];
  const watch: WatchFn = (path, listener) => {
    listeners.set(path, listener);
    return { close: () => closed.push(path) };
  };
  return { watch, fire: (path: string) => listeners.get(path)?.(), listeners, closed };
}

describe('watchFolders', () => {
  it('calls back once after a burst of changes settles', () => {
    vi.useFakeTimers();
    const root = makeTree({ 'agents/a/AGENT.md': 'x', 'skills/s/SKILL.md': 'y' });
    const { watch, fire } = fakeWatch();
    const onChange = vi.fn();
    watchFolders([join(root, 'agents'), join(root, 'skills')], onChange, { debounceMs: 300, watch });

    fire(join(root, 'agents'));
    fire(join(root, 'skills'));
    vi.advanceTimersByTime(200);
    fire(join(root, 'agents'));
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('skips folders that do not exist and closes the others', () => {
    vi.useFakeTimers();
    const root = makeTree({ 'agents/a/AGENT.md': 'x' });
    const { watch, listeners, closed } = fakeWatch();
    const stop = watchFolders([join(root, 'agents'), join(root, 'missing')], () => {}, { debounceMs: 10, watch });
    expect([...listeners.keys()]).toEqual([join(root, 'agents')]);
    stop();
    expect(closed).toEqual([join(root, 'agents')]);
  });

  it('does not call back after being stopped', () => {
    vi.useFakeTimers();
    const root = makeTree({ 'agents/a/AGENT.md': 'x' });
    const { watch, fire } = fakeWatch();
    const onChange = vi.fn();
    const stop = watchFolders([join(root, 'agents')], onChange, { debounceMs: 50, watch });
    fire(join(root, 'agents'));
    stop();
    vi.advanceTimersByTime(100);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('notices a change the file watcher missed, by comparing the files now and then', () => {
    vi.useFakeTimers();
    const root = makeTree({ 'skills/s/SKILL.md': 'v1' });
    const { watch } = fakeWatch();
    const onChange = vi.fn();
    const stop = watchFolders([join(root, 'skills')], onChange, { debounceMs: 50, watch, pollMs: 1000 });

    vi.advanceTimersByTime(2500);
    expect(onChange).not.toHaveBeenCalled();
    // A folder removed and made again: on Linux the recursive watcher may never report it.
    rmSync(join(root, 'skills/s'), { recursive: true });
    mkdirSync(join(root, 'skills/s'));
    writeFileSync(join(root, 'skills/s/SKILL.md'), 'v2, longer');
    vi.advanceTimersByTime(1100);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not call back twice when the watcher saw the change too', () => {
    vi.useFakeTimers();
    const root = makeTree({ 'agents/a/AGENT.md': 'x' });
    const { watch, fire } = fakeWatch();
    const onChange = vi.fn();
    const stop = watchFolders([join(root, 'agents')], onChange, { debounceMs: 50, watch, pollMs: 1000 });
    writeFileSync(join(root, 'agents/a/AGENT.md'), 'x, edited');
    fire(join(root, 'agents'));
    vi.advanceTimersByTime(3000);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
