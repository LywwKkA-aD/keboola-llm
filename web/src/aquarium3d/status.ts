import type { AgentActivity } from '../aquarium/state.ts';

export interface Aura {
  /** Glow under the octopus: tells the state without recoloring the mascot. */
  readonly color: string;
  readonly intensity: number;
  /** Seconds per pulse; 0 = steady. */
  readonly pulse: number;
  /** Tentacle wave speed and size. */
  readonly tentacleSpeed: number;
  readonly tentacleAmp: number;
}

const BLUE = '#228dff';
const CYAN = '#3dd6f5';
const AMBER = '#f5b53d';
const RED = '#ff5c5c';
const GREEN = '#2bd47d';

const AURAS: Record<AgentActivity, Aura> = {
  idle: { color: BLUE, intensity: 0.15, pulse: 0, tentacleSpeed: 0.7, tentacleAmp: 0.06 },
  thinking: { color: CYAN, intensity: 0.8, pulse: 1.6, tentacleSpeed: 1.2, tentacleAmp: 0.09 },
  reading: { color: CYAN, intensity: 0.9, pulse: 0, tentacleSpeed: 1.6, tentacleAmp: 0.1 },
  writing: { color: GREEN, intensity: 1, pulse: 0, tentacleSpeed: 2.6, tentacleAmp: 0.12 },
  computing: { color: BLUE, intensity: 1.1, pulse: 0, tentacleSpeed: 3, tentacleAmp: 0.12 },
  querying: { color: BLUE, intensity: 1.2, pulse: 0.8, tentacleSpeed: 3.2, tentacleAmp: 0.13 },
  planning: { color: CYAN, intensity: 0.9, pulse: 2.2, tentacleSpeed: 1.4, tentacleAmp: 0.1 },
  delegating: { color: CYAN, intensity: 1.1, pulse: 1.2, tentacleSpeed: 1.8, tentacleAmp: 0.14 },
  waiting: { color: AMBER, intensity: 1.2, pulse: 1, tentacleSpeed: 0.9, tentacleAmp: 0.08 },
  working: { color: GREEN, intensity: 0.9, pulse: 0, tentacleSpeed: 2.2, tentacleAmp: 0.11 },
  error: { color: RED, intensity: 1.2, pulse: 0.5, tentacleSpeed: 0.5, tentacleAmp: 0.04 },
};

export const auraFor = (activity: AgentActivity): Aura => AURAS[activity];
