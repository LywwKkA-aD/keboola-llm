import type { AgentInfo } from '../api/types.ts';
import type { AquariumState } from '../aquarium/state.ts';

export type SceneQuality = 'high' | 'medium' | 'low';

export interface AquariumViewProps {
  /** Enabled agents, lead included. */
  readonly agents: readonly AgentInfo[];
  readonly lead: string;
  /** What every agent is doing, from useAquariumEvents. */
  readonly state: AquariumState;
  readonly now: number;
  readonly selected?: string;
  readonly onSelect?: (name: string | undefined) => void;
  readonly quality: SceneQuality;
}

/** The 3D aquarium (three.js). Placeholder until the scene lands; keep this props contract stable. */
export function AquariumView(_props: AquariumViewProps) {
  return <div className="aquarium-view" data-testid="aquarium-view" />;
}
