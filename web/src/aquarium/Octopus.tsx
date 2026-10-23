import type { AgentActivity } from './state.ts';
import { PropIcon } from './PropIcon.tsx';

const TENTACLES = Array.from({ length: 8 }, (_, i) => -24.5 + i * 7);

const shade = (hex: string, amount: number) => {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount));
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
};

/** Eyes look down at work, up while thinking, closed while resting. */
function Eyes({ mood }: { mood: AgentActivity }) {
  if (mood === 'idle') {
    return (
      <g stroke="#1b1e23" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M -13 -12 q 4 3 8 0" />
        <path d="M 5 -12 q 4 3 8 0" />
      </g>
    );
  }
  const dy = mood === 'thinking' || mood === 'waiting' ? -2.5 : 2;
  return (
    <g>
      <circle cx="-9" cy="-12" r="6" fill="#fff" />
      <circle cx="9" cy="-12" r="6" fill="#fff" />
      <circle className="octo__pupil" cx="-9" cy={-12 + dy} r="3" fill="#1b1e23" />
      <circle className="octo__pupil" cx="9" cy={-12 + dy} r="3" fill="#1b1e23" />
    </g>
  );
}

function Accessory({ mood }: { mood: AgentActivity }) {
  switch (mood) {
    case 'thinking':
      return (
        <g className="octo__thought">
          <circle cx="22" cy="-44" r="3" />
          <circle cx="30" cy="-54" r="4.5" />
          <circle cx="40" cy="-66" r="6" />
        </g>
      );
    case 'waiting':
      return (
        <g className="octo__ask">
          <circle cx="30" cy="-52" r="12" fill="#fff" stroke="#f5a524" strokeWidth="2.5" />
          <text x="30" y="-52" textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="800" fill="#f5a524">
            ?
          </text>
        </g>
      );
    case 'error':
      return (
        <g className="octo__ink" fill="#2b2f36" opacity="0.75">
          <circle cx="-30" cy="20" r="12" />
          <circle cx="-42" cy="8" r="9" />
          <circle cx="-22" cy="34" r="8" />
        </g>
      );
    default:
      return null;
  }
}

/** One agent as an animated octopus, drawn around (0, 0) at about 80 x 90 px. */
export function Octopus({ name, color, prop, mood }: { name: string; color: string; prop?: string; mood: AgentActivity }) {
  const dark = shade(color, -45);
  const light = shade(color, 60);
  return (
    <g className={`octo octo--${mood}`}>
      <g className="octo__tentacles" stroke={dark} strokeWidth="6" strokeLinecap="round" fill="none">
        {TENTACLES.map((x, i) => (
          <path
            key={x}
            className="octo__tentacle"
            style={{ animationDelay: `${(i % 4) * -0.35}s` }}
            d={`M ${x} 6 C ${x - 5} 20, ${x + 7} 30, ${x + (i < 4 ? -4 : 4)} 44`}
          />
        ))}
      </g>
      <ellipse cx="0" cy="-10" rx="27" ry="25" fill={color} />
      <ellipse cx="-9" cy="-22" rx="9" ry="6" fill={light} opacity="0.6" />
      <Eyes mood={mood} />
      <path d="M -5 2 q 5 4 10 0" stroke="#1b1e23" strokeWidth="2" fill="none" strokeLinecap="round" />
      <g className="octo__prop" transform="translate(30 18)">
        <PropIcon prop={prop} fallback={name} />
      </g>
      <Accessory mood={mood} />
    </g>
  );
}
