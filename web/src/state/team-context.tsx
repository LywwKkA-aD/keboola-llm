import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { AgentInfo, TeamInfo } from '../api/types.ts';

const EMPTY: TeamInfo = { lead: 'lead', agents: [], skills: [], warnings: [], loadErrors: [] };

const TeamContext = createContext<TeamInfo>(EMPTY);
const RefreshTeamContext = createContext<() => void>(() => {});

export function TeamProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<TeamInfo>(EMPTY);
  const refresh = useCallback(() => {
    api.team().then(setTeam).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);
  return (
    <RefreshTeamContext.Provider value={refresh}>
      <TeamContext.Provider value={team}>{children}</TeamContext.Provider>
    </RefreshTeamContext.Provider>
  );
}

export const useTeam = () => useContext(TeamContext);
/** Refetch the team, e.g. after agent-builder added an agent. */
export const useRefreshTeam = () => useContext(RefreshTeamContext);

const FALLBACK_COLOR = '#8C96A3';

export function agentColor(team: TeamInfo, name: string): string {
  return team.agents.find((agent: AgentInfo) => agent.name === name)?.avatar?.color ?? FALLBACK_COLOR;
}
