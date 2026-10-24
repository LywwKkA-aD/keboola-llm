import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.ts';
import type { AppStatus, PendingApprovalEntry } from '../api/types.ts';
import { type AquariumEvents, useAquariumEvents } from '../aquarium/useAquariumEvents.ts';
import { initialAquarium } from '../aquarium/state.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useRefreshTeam, useTeam } from '../state/team-context.tsx';
import { initialLive } from './live-state.ts';

export interface LiveValue extends AquariumEvents {
  readonly approvals: readonly PendingApprovalEntry[];
  readonly refreshApprovals: () => void;
  readonly status?: AppStatus;
}

const STATUS_POLL_MS = 30_000;

const LiveContext = createContext<LiveValue>({
  state: initialAquarium('lead'),
  now: 0,
  connected: false,
  live: initialLive(),
  approvals: [],
  refreshApprovals: () => {},
});

/** One event stream for the whole app, plus the pending approvals and the status line it implies. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const team = useTeam();
  const refreshTeam = useRefreshTeam();
  const { settings } = useSettings();
  const events = useAquariumEvents(team.lead);
  const [approvals, setApprovals] = useState<readonly PendingApprovalEntry[]>([]);
  const [status, setStatus] = useState<AppStatus>();

  const refreshApprovals = useCallback(() => {
    api.allApprovals().then(setApprovals).catch(() => {});
  }, []);

  const { approvalsVersion, teamVersion, running, waiting } = events.live;
  useEffect(refreshApprovals, [refreshApprovals, approvalsVersion]);
  useEffect(() => {
    if (teamVersion > 0) refreshTeam();
  }, [refreshTeam, teamVersion]);

  const runsKey = `${running.join(',')}|${waiting.join(',')}|${settings.model}|${settings.keboolaProject}`;
  useEffect(() => {
    const load = () => api.status().then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [runsKey]);

  const value = useMemo<LiveValue>(
    () => ({ ...events, approvals, refreshApprovals, ...(status ? { status } : {}) }),
    [events, approvals, refreshApprovals, status],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
