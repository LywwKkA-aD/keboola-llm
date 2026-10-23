/** Development preview of the 3D aquarium driven by the demo script: http://127.0.0.1:5173/preview.html */
import '@fontsource/ibm-plex-mono';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentInfo, BusEvent, TeamInfo } from '../api/types.ts';
import { initialAquarium, reduceAquarium } from '../aquarium/state.ts';
import { AquariumView, type SceneQuality } from '../aquarium3d/AquariumView.tsx';
import { demoTick } from '../aquarium3d/demo.ts';

const TICK_MS = 2200;

/** ?demo=busy: a frozen moment with every station in use, for reviewing the scene. */
const BUSY: BusEvent[] = [
  { type: 'run.started', runId: 'busy' },
  { type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Find where customer_id is used' },
  { type: 'tool.start', agent: 'keboola-expert', callId: 't1', tool: 'kbagent_read', args: { purpose: 'Search configs for customer_id' } },
  { type: 'tool.start', agent: 'kbc-sql-reviewer', callId: 't2', tool: 'kbagent_sql', args: { purpose: 'Count duplicated order rows' } },
  { type: 'tool.start', agent: 'kbc-performance-optimizer', callId: 't3', tool: 'kbagent_read', args: { purpose: 'Job durations, last 30 days' } },
  { type: 'tool.start', agent: 'knowledge-keeper', callId: 't4', tool: 'read_file', args: { file_path: '/knowledge/glossary.md' } },
  { type: 'tool.start', agent: 'kbc-config-reviewer', callId: 't5', tool: 'edit_file', args: { file_path: '/knowledge/conventions/naming.md' } },
  { type: 'tool.start', agent: 'agent-builder', callId: 't6', tool: 'write_file', args: { file_path: '/agents/data-contracts/AGENT.md' } },
  { type: 'approval.required', interruptId: 'a1', requests: [{ tool: 'write_file', args: {}, decisions: ['approve', 'reject'] }] },
  { type: 'tool.start', agent: 'kbc-dwh-architect', callId: 't7', tool: 'kbagent_write', args: { purpose: 'Create dev branch' } },
  { type: 'approval.required', interruptId: 'a2', requests: [{ tool: 'kbagent_write', args: {}, decisions: ['approve', 'reject'] }] },
];

function Preview() {
  const [team, setTeam] = useState<TeamInfo>();
  const [state, setState] = useState(() => initialAquarium('lead'));
  const [selected, setSelected] = useState<string>();
  const params = new URLSearchParams(location.search);
  const quality = (params.get('quality') ?? 'high') as SceneQuality;

  useEffect(() => {
    fetch('/api/team').then((r) => r.json()).then(setTeam).catch(() => {});
  }, []);

  useEffect(() => {
    if (params.get('demo') === 'busy') {
      setState((current) => BUSY.reduce((s, event, i) => reduceAquarium(s, { seq: i, threadId: 'busy', event }, Date.now()), current));
      return undefined;
    }
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
