import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unmount first, then restore stubbed globals: an effect still pending at the end of a test must never
// run against a real (missing) fetch or EventSource. Setup hooks run after each file's own afterEach.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
