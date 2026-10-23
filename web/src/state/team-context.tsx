import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { AgentInfo, TeamInfo } from '../api/types.ts';

const EMPTY: TeamInfo = { lead: 'lead', agents: [], skills: [], warnings: [], loadErrors: [] };

const TeamContext = createContext<TeamInfo>(EMPTY);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<TeamInfo>(EMPTY);
  useEffect(() => {
    api.team().then(setTeam).catch(() => {});
  }, []);
  return <TeamContext.Provider value={team}>{children}</TeamContext.Provider>;
}

export const useTeam = () => useContext(TeamContext);

const FALLBACK_COLOR = '#8C96A3';

export function agentColor(team: TeamInfo, name: string): string {
  return team.agents.find((agent: AgentInfo) => agent.name === name)?.avatar?.color ?? FALLBACK_COLOR;
}
