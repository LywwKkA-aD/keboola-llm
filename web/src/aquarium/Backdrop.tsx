import { SCENE, STATIONS } from './layout.ts';

const BUBBLES = [80, 260, 470, 640, 820, 1010, 1130];
const WEEDS = [40, 120, 300, 540, 760, 1060, 1160];

/** Water, light, sand, seaweed and the work stations. Purely decorative. */
export function Backdrop({ busyStations }: { busyStations: ReadonlySet<string> }) {
  const { width, height } = SCENE;
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id="aq-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd1ff" />
          <stop offset="0.55" stopColor="#2f8fd8" />
          <stop offset="1" stopColor="#174d8c" />
        </linearGradient>
        <linearGradient id="aq-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="url(#aq-water)" />
      {[150, 520, 880].map((x) => (
        <path key={x} className="aq-ray" d={`M ${x} 0 L ${x + 90} 0 L ${x + 260} ${height} L ${x + 120} ${height} Z`} fill="url(#aq-ray)" />
      ))}
      <path d={`M 0 ${height - 70} Q 300 ${height - 100} 600 ${height - 75} T ${width} ${height - 80} L ${width} ${height} L 0 ${height} Z`} fill="#e8cf96" />
      {WEEDS.map((x, i) => (
        <path
          key={x}
          className="aq-weed"
          style={{ animationDelay: `${i * -0.6}s` }}
          d={`M ${x} ${height - 60} q -14 -40 0 -80 q 14 -40 0 -80`}
          stroke={i % 2 ? '#2fa65a' : '#1f8a4c'}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {BUBBLES.map((x, i) => (
        <circle key={x} className="aq-bubble" style={{ animationDelay: `${i * -1.7}s` }} cx={x} cy={height - 40} r={4 + (i % 3) * 2} />
      ))}

      <g transform={`translate(${STATIONS.bookshelf.x - 80} ${STATIONS.bookshelf.y - 150})`}>
        <rect width="70" height="170" rx="4" fill="#8a5a33" />
        {[10, 60, 110].map((y) =>
          ['#e5383b', '#1f8fff', '#f5a524', '#17c964', '#7a5cff'].map((color, i) => (
            <rect key={`${y}${color}`} x={6 + i * 12} y={y} width="10" height="42" fill={color} />
          )),
        )}
      </g>

      <g transform={`translate(${STATIONS.computers.x - 50} ${STATIONS.computers.y - 120})`}>
        <rect x="-10" y="95" width="230" height="12" rx="3" fill="#5b6472" />
        {[0, 110].map((x) => (
          <g key={x} transform={`translate(${x} 0)`}>
            <rect width="100" height="70" rx="5" fill="#2b2f36" />
            <rect x="6" y="6" width="88" height="58" fill={busyStations.has('computers') ? '#103a2a' : '#1d2733'} />
            {busyStations.has('computers') &&
              [14, 24, 34, 44].map((y, i) => <rect key={y} className="aq-code" style={{ animationDelay: `${i * 0.25}s` }} x="12" y={y} width={40 + ((i * 17) % 35)} height="4" fill="#39ff8f" />)}
            <rect x="44" y="70" width="12" height="25" fill="#5b6472" />
          </g>
        ))}
      </g>

      <g transform={`translate(${STATIONS.workbench.x - 70} ${STATIONS.workbench.y + 30})`}>
        <rect width="140" height="14" rx="3" fill="#a0703f" />
        <rect x="10" y="14" width="10" height="45" fill="#7a5530" />
        <rect x="120" y="14" width="10" height="45" fill="#7a5530" />
        <rect x="30" y="-16" width="34" height="16" fill="#fdfdf8" transform="rotate(-8 47 -8)" />
      </g>

      <g transform={`translate(${STATIONS.desk.x - 90} ${STATIONS.desk.y + 32})`}>
        <rect width="180" height="16" rx="4" fill="#3b4a63" />
        <rect x="18" y="16" width="12" height="40" fill="#2c3850" />
        <rect x="150" y="16" width="12" height="40" fill="#2c3850" />
      </g>

      {/* Position and animation live on separate groups: a CSS transform would replace the translate attribute. */}
      {/* The bell sits on a small shelf left of where the waiting octopus floats. */}
      <g transform={`translate(${STATIONS.bell.x - 75} ${STATIONS.bell.y + 30})`}>
        <rect x="-34" y="18" width="68" height="8" rx="3" fill="#8a5a33" />
        <g className={busyStations.has('bell') ? 'aq-bell aq-bell--ringing' : 'aq-bell'}>
          <rect x="-26" y="10" width="52" height="8" rx="3" fill="#5b6472" />
          <path d="M -20 10 Q -20 -14 0 -14 Q 20 -14 20 10 Z" fill="#f5c542" stroke="#b8901f" strokeWidth="2" />
          <circle cy="-17" r="4" fill="#b8901f" />
        </g>
      </g>
    </g>
  );
}
