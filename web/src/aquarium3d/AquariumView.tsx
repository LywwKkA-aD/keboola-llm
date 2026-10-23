import { lazy, Suspense, useState } from 'react';
import type { AgentInfo } from '../api/types.ts';
import type { AquariumState } from '../aquarium/state.ts';
import { hasWebGL, prefersReducedMotion } from './capabilities.ts';
import './aquarium3d.css';

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
  /** Freeze animations; defaults to the operating system preference. */
  readonly reducedMotion?: boolean;
}

const AquariumCanvas = lazy(() => import('./scene/AquariumCanvas.tsx'));

/** The 3D aquarium. three.js loads on demand; without WebGL a quiet placeholder keeps the layout. */
export function AquariumView(props: AquariumViewProps) {
  const [webgl] = useState(hasWebGL);
  const [systemReduced] = useState(prefersReducedMotion);
  if (!webgl) {
    return (
      <div className="aquarium-view aquarium-view--fallback" data-testid="aquarium-view">
        <span>3D view needs WebGL</span>
      </div>
    );
  }
  return (
    <div className="aquarium-view" data-testid="aquarium-view">
      <Suspense fallback={<div className="aquarium-view__loading" />}>
        <AquariumCanvas {...props} reducedMotion={props.reducedMotion ?? systemReduced} />
      </Suspense>
    </div>
  );
}
