import type { ReactElement } from 'react';

/** Small SVG objects an octopus holds, keyed by the `avatar.prop` word of its AGENT.md. Drawn around (0, 0), ~20px. */

const INK = '#2b2f36';
const PAPER = '#fdfdf8';

const ICONS: Record<string, ReactElement> = {
  magnifier: (
    <g>
      <circle cx="-2" cy="-2" r="7" fill="#d8f0ff" stroke={INK} strokeWidth="2.5" />
      <line x1="3" y1="3" x2="10" y2="10" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    </g>
  ),
  telescope: (
    <g transform="rotate(-30)">
      <rect x="-10" y="-4" width="20" height="8" rx="2" fill="#7a5cff" stroke={INK} strokeWidth="1.5" />
      <rect x="8" y="-5" width="4" height="10" rx="1" fill="#c9bfff" stroke={INK} strokeWidth="1.5" />
    </g>
  ),
  book: (
    <g>
      <rect x="-9" y="-11" width="18" height="22" rx="2" fill="#e5383b" stroke={INK} strokeWidth="1.5" />
      <line x1="-5" y1="-11" x2="-5" y2="11" stroke={INK} strokeWidth="1.5" />
    </g>
  ),
  books: (
    <g>
      <rect x="-11" y="-10" width="7" height="20" fill="#1f8fff" stroke={INK} strokeWidth="1.2" />
      <rect x="-4" y="-12" width="7" height="22" fill="#f5a524" stroke={INK} strokeWidth="1.2" />
      <rect x="3" y="-9" width="7" height="19" fill="#17c964" stroke={INK} strokeWidth="1.2" transform="rotate(8 6 0)" />
    </g>
  ),
  wrench: (
    <g transform="rotate(45)">
      <rect x="-2.5" y="-4" width="5" height="16" rx="2" fill="#9aa4b1" stroke={INK} strokeWidth="1.5" />
      <path d="M -7 -8 A 7 7 0 1 1 7 -8 L 3 -8 L 3 -4 L -3 -4 L -3 -8 Z" fill="#9aa4b1" stroke={INK} strokeWidth="1.5" />
    </g>
  ),
  laptop: (
    <g>
      <rect x="-11" y="-9" width="22" height="14" rx="2" fill="#2b2f36" />
      <rect x="-9" y="-7" width="18" height="10" fill="#5fd3ff" />
      <rect x="-13" y="5" width="26" height="4" rx="1.5" fill="#9aa4b1" />
    </g>
  ),
  stopwatch: (
    <g>
      <circle r="9" fill={PAPER} stroke={INK} strokeWidth="2" />
      <rect x="-2" y="-14" width="4" height="4" fill={INK} />
      <line x1="0" y1="0" x2="4" y2="-5" stroke="#e5383b" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  shield: (
    <path d="M 0 -11 L 9 -7 L 8 3 Q 6 9 0 12 Q -6 9 -8 3 L -9 -7 Z" fill="#17c964" stroke={INK} strokeWidth="1.5" />
  ),
  calculator: (
    <g>
      <rect x="-8" y="-11" width="16" height="22" rx="2" fill="#5b6472" stroke={INK} strokeWidth="1.5" />
      <rect x="-6" y="-9" width="12" height="5" fill="#c8f7c5" />
      {[-4, 0, 4].flatMap((x) => [0, 4, 8].map((y) => <rect key={`${x}${y}`} x={x - 1.5} y={y - 1.5} width="3" height="3" fill={PAPER} />))}
    </g>
  ),
  clipboard: (
    <g>
      <rect x="-8" y="-10" width="16" height="21" rx="2" fill="#c49a6c" stroke={INK} strokeWidth="1.5" />
      <rect x="-6" y="-7" width="12" height="16" fill={PAPER} />
      <rect x="-3" y="-12" width="6" height="4" rx="1" fill={INK} />
    </g>
  ),
  checklist: (
    <g>
      <rect x="-8" y="-11" width="16" height="22" rx="2" fill={PAPER} stroke={INK} strokeWidth="1.5" />
      {[-5, 1, 7].map((y) => (
        <path key={y} d={`M -5 ${y} l 2 2 l 3 -4`} stroke="#17c964" strokeWidth="1.8" fill="none" />
      ))}
    </g>
  ),
  papers: (
    <g>
      <rect x="-6" y="-12" width="15" height="20" fill={PAPER} stroke={INK} strokeWidth="1.2" transform="rotate(10)" />
      <rect x="-9" y="-10" width="15" height="20" fill={PAPER} stroke={INK} strokeWidth="1.2" />
    </g>
  ),
  microscope: (
    <g>
      <rect x="-2" y="-12" width="5" height="14" rx="1.5" fill="#9aa4b1" stroke={INK} strokeWidth="1.3" transform="rotate(-20)" />
      <path d="M -9 10 L 9 10 L 6 6 L -6 6 Z" fill="#5b6472" />
      <circle cx="2" cy="2" r="3" fill="#5fd3ff" stroke={INK} strokeWidth="1.2" />
    </g>
  ),
  blueprint: (
    <g>
      <rect x="-11" y="-9" width="22" height="18" rx="1.5" fill="#1f5fbf" />
      <path d="M -7 4 L -7 -5 L 3 -5 L 3 4 Z M -2 -5 L -2 4" stroke="#cfe6ff" strokeWidth="1.2" fill="none" />
    </g>
  ),
  glasses: (
    <g>
      <circle cx="-6" cy="0" r="5" fill="#d8f0ff" stroke={INK} strokeWidth="2" />
      <circle cx="6" cy="0" r="5" fill="#d8f0ff" stroke={INK} strokeWidth="2" />
      <line x1="-1" y1="0" x2="1" y2="0" stroke={INK} strokeWidth="2" />
    </g>
  ),
  pencil: (
    <g transform="rotate(-40)">
      <rect x="-3" y="-11" width="6" height="18" fill="#f5a524" stroke={INK} strokeWidth="1.3" />
      <path d="M -3 7 L 3 7 L 0 12 Z" fill="#f3d7b0" stroke={INK} strokeWidth="1.3" />
    </g>
  ),
  flask: (
    <path d="M -3 -11 L 3 -11 L 3 -3 L 9 9 Q 10 11 7 11 L -7 11 Q -10 11 -9 9 L -3 -3 Z" fill="#b8f5c8" stroke={INK} strokeWidth="1.5" />
  ),
  headset: (
    <g>
      <path d="M -9 3 Q -9 -10 0 -10 Q 9 -10 9 3" stroke={INK} strokeWidth="2.5" fill="none" />
      <rect x="-12" y="0" width="6" height="9" rx="2" fill="#1f8fff" />
      <rect x="6" y="0" width="6" height="9" rx="2" fill="#1f8fff" />
    </g>
  ),
};

export function PropIcon({ prop, fallback }: { prop?: string; fallback: string }) {
  const icon = prop ? ICONS[prop] : undefined;
  if (icon) return icon;
  return (
    <g>
      <circle r="8" fill={PAPER} stroke={INK} strokeWidth="1.5" />
      <text textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill={INK}>
        {fallback.slice(0, 1).toUpperCase()}
      </text>
    </g>
  );
}
