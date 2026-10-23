/** Development preview of the 3D aquarium driven by the demo script: http://127.0.0.1:5173/preview.html */
import '@fontsource/ibm-plex-mono';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentInfo, TeamInfo } from '../api/types.ts';
import { initialAquarium, reduceAquarium } from '../aquarium/state.ts';
import { AquariumView, type SceneQuality } from '../aquarium3d/AquariumView.tsx';
import { demoTick } from '../aquarium3d/demo.ts';

const TICK_MS = 2200;

function Preview() {
  const [team, setTeam] = useState<TeamInfo>();
  const [state, setState] = useState(() => initialAquarium('lead'));
  const [selected, setSelected] = useState<string>();
  const quality = (new URLSearchParams(location.search).get('quality') ?? 'high') as SceneQuality;

  useEffect(() => {
    fetch('/api/team').then((r) => r.json()).then(setTeam).catch(() => {});
  }, []);

  useEffect(() => {
    let step = 0;
    const timer = setInterval(() => {
      const envelopes = demoTick(step);
      step += 1;
      setState((current) => envelopes.reduce((s, e) => reduceAquarium(s, e, Date.now()), current));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!team) return null;
  const agents: AgentInfo[] = team.agents.filter((agent) => agent.enabled);
  return <AquariumView agents={agents} lead={team.lead} state={state} now={Date.now()} selected={selected} onSelect={setSelected} quality={quality} />;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Preview /></StrictMode>);
