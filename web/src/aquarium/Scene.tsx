import type { AgentInfo } from '../api/types.ts';
import { Backdrop } from './Backdrop.tsx';
import { layoutAgents, SCENE } from './layout.ts';
import { Octopus } from './Octopus.tsx';
import { type AgentActivity, type AquariumState, moodOf } from './state.ts';

const FALLBACK_COLOR = '#8c96a3';
const LABEL_CHARS = 22;

const shorten = (text: string) => (text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text);

/** Vendored Keboola roles share a "kbc-" prefix; drop it under the octopus to save room. */
export const displayName = (name: string) => name.replace(/^kbc-/, '');

function busyStations(moods: Readonly<Record<string, AgentActivity>>): Set<string> {
  const values = Object.values(moods);
  return new Set([
    ...(values.some((mood) => mood === 'computing' || mood === 'querying') ? ['computers'] : []),
    ...(values.some((mood) => mood === 'waiting') ? ['bell'] : []),
  ]);
}

/** The aquarium: every enabled agent as an octopus that swims to the station of its current work. */
export function Scene({ agents, lead, state, now, label }: {
  agents: readonly AgentInfo[];
  lead: string;
  state: AquariumState;
  now: number;
  label: string;
}) {
  const moods = Object.fromEntries(agents.map((agent) => [agent.name, moodOf(state.agents[agent.name], now)]));
  const positions = layoutAgents({ names: agents.map((agent) => agent.name), lead, moods });

  return (
    <svg className="aquarium" viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} role="img" aria-label={label}>
      <Backdrop busyStations={busyStations(moods)} />
      {agents.map((agent, index) => {
        const position = positions[agent.name] ?? { x: 0, y: 0 };
        const mood = moods[agent.name] ?? 'idle';
        const caption = mood === 'idle' ? '' : state.agents[agent.name]?.label ?? '';
        return (
          <g key={agent.name} className="octo-pos" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
            <title>{`${agent.name}: ${agent.description}`}</title>
            <g className="octo-bob" style={{ animationDelay: `${(index % 5) * -0.7}s` }}>
              <Octopus name={agent.name} color={agent.avatar?.color ?? FALLBACK_COLOR} prop={agent.avatar?.prop} mood={mood} />
            </g>
            <text className="octo-name" y="64" textAnchor="middle">
              {displayName(agent.name)}
            </text>
            {caption && (
              <text className="octo-caption" y="-78" textAnchor="middle">
                {shorten(caption)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
