import { describe, expect, it } from 'vitest';
import type { AgentInfo, Envelope } from '../api/types.ts';
import { initialAquarium, reduceAquarium } from '../aquarium/state.ts';
import { STATION_SPOTS } from './floorplan.ts';
import { STATIONS_3D } from './layout3d.ts';
import { buildSceneModel } from './sceneModel.ts';

const agent = (name: string, role: AgentInfo['role'] = 'subagent'): AgentInfo => ({ name, description: 'd', role, enabled: true, skills: [], tools: [] });
const agents = [agent('lead', 'orchestrator'), agent('keboola-expert'), agent('kbc-sql-reviewer'), agent('knowledge-keeper')];

const play = (events: Envelope['event'][], threadId = 't1') =>
  events.reduce((state, event, i) => reduceAquarium(state, { seq: i, threadId, event }, 0), initialAquarium('lead'));

describe('buildSceneModel', () => {
  it('rests everyone when nothing happens', () => {
    const model = buildSceneModel({ agents, lead: 'lead', state: initialAquarium('lead'), now: 0 });
    expect(Object.values(model.moods)).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(Object.values(model.stations).some(Boolean)).toBe(false);
    expect(model.links).toEqual([]);
    expect(model.spots.lead?.position).toEqual(STATIONS_3D.command.position);
  });

  it('lights stations in use, links the lead to busy delegates and captions their work', () => {
    const state = play([
      { type: 'delegate.start', agent: 'lead', callId: 'd', to: 'keboola-expert', task: 'Find usages of customer_id' },
      { type: 'tool.start', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', args: { purpose: 'Search configs' } },
      { type: 'tool.start', agent: 'knowledge-keeper', callId: 'k', tool: 'read_file', args: { file_path: '/knowledge/glossary.md' } },
    ]);
    const model = buildSceneModel({ agents, lead: 'lead', state, now: 0 });

    expect(model.stations).toMatchObject({ console: true, archive: true, command: true, forge: false, beacon: false });
    expect(model.links).toEqual(['keboola-expert', 'knowledge-keeper']);
    expect(model.captions['keboola-expert']).toBe('Search configs');
    expect(model.captions.lead).toBe('Find usages of customer_id');
  });

  it('counts how many places of each station are taken', () => {
    const state = play([
      { type: 'tool.start', agent: 'keboola-expert', callId: 't1', tool: 'kbagent_read', args: {} },
      { type: 'tool.start', agent: 'kbc-sql-reviewer', callId: 't2', tool: 'kbagent_sql', args: {} },
    ]);
    const model = buildSceneModel({ agents, lead: 'lead', state, now: 0 });
    expect(model.occupancy).toMatchObject({ console: 2, beacon: 0, archive: 0 });
  });

  it('does not link agents working in another chat than the lead', () => {
    const state = [
      { threadId: 't1', event: { type: 'run.started', runId: 'r' } },
      { threadId: 't2', event: { type: 'token', agent: 'kbc-sql-reviewer', text: 'x' } },
    ].reduce((s, e, i) => reduceAquarium(s, { seq: i, ...e } as Envelope, 0), initialAquarium('lead'));
    expect(buildSceneModel({ agents, lead: 'lead', state, now: 0 }).links).toEqual([]);
  });

  it('hides captions of resting agents and fades errors after a while', () => {
    const state = play([
      { type: 'token', agent: 'kbc-sql-reviewer', text: 'x' },
      { type: 'run.failed', runId: 'r', error: 'boom' },
    ]);
    expect(buildSceneModel({ agents, lead: 'lead', state, now: 0 }).moods['kbc-sql-reviewer']).toBe('error');
    const later = buildSceneModel({ agents, lead: 'lead', state, now: 60_000 });
    expect(later.moods['kbc-sql-reviewer']).toBe('idle');
    expect(later.captions['kbc-sql-reviewer']).toBe('');
  });

  it('keeps a busy agent at its station while it thinks between tool calls, not walking back and forth', () => {
    const state = play([
      { type: 'delegate.start', agent: 'lead', callId: 'd', to: 'keboola-expert', task: 'Find tables' },
      { type: 'tool.start', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', args: {} },
      { type: 'tool.end', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', ok: true, preview: '' },
    ]);
    const model = buildSceneModel({ agents, lead: 'lead', state, now: 0 });
    expect(model.moods['keboola-expert']).toBe('thinking');
    expect(model.spots['keboola-expert']?.position).toEqual(STATION_SPOTS.console[0]);
  });

  it('never sends a subagent planning its own task to the lead desk', () => {
    const state = play([
      { type: 'delegate.start', agent: 'lead', callId: 'd', to: 'knowledge-keeper', task: 'Organize notes' },
      { type: 'tool.start', agent: 'knowledge-keeper', callId: 'p', tool: 'write_todos', args: { todos: [] } },
    ]);
    const model = buildSceneModel({ agents, lead: 'lead', state, now: 0 });
    expect(model.spots['knowledge-keeper']?.position).not.toEqual(STATION_SPOTS.command[0]);
    expect(model.occupancy.command).toBe(1);
  });
});
