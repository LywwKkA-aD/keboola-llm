import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy/waitFor give up after 1 s by default, which a loaded machine (CI, parallel suites) can exceed.
configure({ asyncUtilTimeout: 3000 });

// Unmount first, then restore stubbed globals: an effect still pending at the end of a test must never
// run against a real (missing) fetch or EventSource. Setup hooks run after each file's own afterEach.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
