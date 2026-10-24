import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { UsageReport } from '../api/types.ts';
import { useLive } from './live-context.tsx';

/** Model calls come in bursts (an agent and its tools); refetch once the burst settles. */
export const USAGE_REFRESH_MS = 800;
/** And now and then, so "today" turns over at midnight on a page left open. */
const USAGE_POLL_MS = 5 * 60_000;

/** The token report of the server (kept across restarts), refetched after every model call. */
export function useUsage(): UsageReport | undefined {
  const { live } = useLive();
  const version = live.usageVersion;
  const [report, setReport] = useState<UsageReport>();

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .usage()
        .then((next) => {
          if (alive) setReport(next);
        })
        .catch(() => {});
    };
    const soon = setTimeout(load, version === 0 ? 0 : USAGE_REFRESH_MS);
    const poll = setInterval(load, USAGE_POLL_MS);
    return () => {
      alive = false;
      clearTimeout(soon);
      clearInterval(poll);
    };
  }, [version]);

  return report;
}
