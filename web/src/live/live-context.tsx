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
  /** Ask the server which chats run and wait now, and reconcile the live view (e.g. after a chat was deleted). */
  readonly refreshStatus: () => void;
  readonly status?: AppStatus;
}

const STATUS_POLL_MS = 30_000;

interface LiveActions {
  readonly refreshApprovals: () => void;
  readonly refreshStatus: () => void;
}

const LiveActionsContext = createContext<LiveActions>({ refreshApprovals: () => {}, refreshStatus: () => {} });

const LiveContext = createContext<LiveValue>({
  state: initialAquarium('lead'),
  now: 0,
  connected: false,
  live: initialLive(),
  approvals: [],
  refreshApprovals: () => {},
  refreshStatus: () => {},
  reconnects: 0,
  mark: () => 0,
  reconcile: () => {},
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

  const { mark, reconcile, reconnects } = events;
  const refreshStatus = useCallback(() => {
    const since = mark();
    api
      .status()
      .then((next) => {
        setStatus(next);
        if (next.running && next.waiting) reconcile(next.running, next.waiting, since);
      })
      .catch(() => {});
  }, [mark, reconcile]);

  // Polled, and asked again whenever the runs change or the stream comes back after a drop (a server restart may
  // have ended runs this page never heard end).
  const runsKey = `${running.join(',')}|${waiting.join(',')}|${settings.model}|${settings.keboolaProject}`;
  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshStatus, runsKey, reconnects]);

  const value = useMemo<LiveValue>(
    () => ({ ...events, approvals, refreshApprovals, refreshStatus, ...(status ? { status } : {}) }),
    [events, approvals, refreshApprovals, refreshStatus, status],
  );
  const actions = useMemo<LiveActions>(() => ({ refreshApprovals, refreshStatus }), [refreshApprovals, refreshStatus]);
  return (
    <LiveActionsContext.Provider value={actions}>
      <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
    </LiveActionsContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);

/** The refresh actions alone: stable, so a page that only needs them does not re-render on every event. */
export const useLiveActions = () => useContext(LiveActionsContext);
