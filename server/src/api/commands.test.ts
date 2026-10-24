import { describe, expect, it } from 'vitest';
import { commandError, commandLabel, userTurn } from './commands.ts';
import type { TeamInfo } from './types.ts';

const agent = (name: string, enabled = true) => ({ name, description: '', role: 'subagent' as const, enabled, skills: [], tools: [] });
const team: TeamInfo = {
  lead: 'lead',
  agents: [{ ...agent('lead'), role: 'orchestrator' }, agent('keboola-developer'), agent('component-builder', false)],
  skills: [{ name: 'keboola-change', description: 'Change safely', source: 'custom', path: '/skills/custom/keboola-change/' }],
  warnings: [],
  loadErrors: [],
};

const contentOf = (turn: ReturnType<typeof userTurn>) => String(turn.messages[0]?.content ?? '');

describe('chat commands', () => {
  it('sends plain text unchanged', () => {
    expect(userTurn('Count orders', undefined, team)).toEqual({ messages: [{ role: 'user', content: 'Count orders' }] });
  });

  it('points the lead at the skill file for /skill and keeps what the user typed for the history', () => {
    const turn = userTurn('Fix the join in orders', { name: 'skill', arg: 'keboola-change' }, team);
    expect(contentOf(turn)).toContain('/skills/custom/keboola-change/SKILL.md');
    expect(contentOf(turn)).toContain('Fix the join in orders');
    expect(turn.messages[0]?.additional_kwargs).toEqual({ studio: { text: 'Fix the join in orders', command: { name: 'skill', arg: 'keboola-change' } } });
  });

  it('applies a skill on its own when /skill comes without a request', () => {
    expect(contentOf(userTurn('', { name: 'skill', arg: 'keboola-change' }, team))).toMatch(/as the skill describes/);
  });

  it('tells the lead to hand the task to the named agent for /agent', () => {
    const content = contentOf(userTurn('Fix the join', { name: 'agent', arg: 'keboola-developer' }, team));
    expect(content).toMatch(/task tool/);
    expect(content).toContain('"keboola-developer"');
  });

  it('asks for a plan to approve first for /plan', () => {
    expect(contentOf(userTurn('Rebuild the orders model', { name: 'plan' }, team))).toContain('request_plan_approval');
  });

  it('refuses unknown skills, unknown, disabled or lead agents, and commands that need a request', () => {
    expect(commandError('x', { name: 'skill', arg: 'ghost' }, team)).toMatch(/No skill "ghost"/);
    expect(commandError('x', { name: 'agent', arg: 'ghost' }, team)).toMatch(/No agent "ghost"/);
    expect(commandError('x', { name: 'agent', arg: 'component-builder' }, team)).toMatch(/turned off/);
    expect(commandError('x', { name: 'agent', arg: 'lead' }, team)).toMatch(/lead/);
    expect(commandError('', { name: 'agent', arg: 'keboola-developer' }, team)).toMatch(/what to do/);
    expect(commandError('', { name: 'plan' }, team)).toMatch(/what to do/);
    expect(commandError('', { name: 'skill', arg: 'keboola-change' }, team)).toBeUndefined();
    expect(commandError('Go', { name: 'agent', arg: 'keboola-developer' }, team)).toBeUndefined();
    expect(commandError('', undefined, team)).toMatch(/what to do/);
  });

  it('labels a command the way the user types it', () => {
    expect(commandLabel({ name: 'skill', arg: 'keboola-change' })).toBe('/skill keboola-change');
    expect(commandLabel({ name: 'plan' })).toBe('/plan');
  });
});
