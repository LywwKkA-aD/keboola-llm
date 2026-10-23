import { describe, expect, it } from 'vitest';
import { initialAquarium, reduceAquarium } from '../aquarium/state.ts';
import { buildSceneModel } from './sceneModel.ts';
import { DEMO_LENGTH, demoTick } from './demo.ts';

const names = ['lead', 'keboola-expert', 'knowledge-keeper', 'kbc-sql-reviewer', 'agent-builder'];
const agents = names.map((name) => ({ name, description: '', role: name === 'lead' ? 'orchestrator' : 'subagent', enabled: true, skills: [], tools: [] }) as const);

describe('demoTick', () => {
  it('loops and lights every station at some point, ending with everyone at rest', () => {
    let state = initialAquarium('lead');
    const lit = new Set<string>();
    for (let step = 0; step < DEMO_LENGTH; step += 1) {
      state = demoTick(step).reduce((current, envelope) => reduceAquarium(current, envelope, 0), state);
      const model = buildSceneModel({ agents, lead: 'lead', state, now: 0 });
      Object.entries(model.stations).forEach(([station, on]) => on && lit.add(station));
    }
    expect([...lit].sort()).toEqual(['archive', 'beacon', 'command', 'console', 'forge']);
    expect(Object.values(state.agents).every((agent) => agent.activity === 'idle')).toBe(true);
    expect(demoTick(DEMO_LENGTH)).toEqual(demoTick(0).map((e) => ({ ...e, seq: DEMO_LENGTH * 10 + (e.seq % 10) })));
  });
});
