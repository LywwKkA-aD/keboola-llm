import { describe, expect, it } from 'vitest';
import type { AgentDefinition, SkillInfo } from '../registry/types.ts';
import { createToolResolver } from '../tools/catalog.ts';
import { buildTeamSpec } from './team.ts';

const base = { enabled: true, skills: [], tools: [], writes: [], approve: [], prompt: 'Body.', file: '' };
const lead = { ...base, name: 'lead', role: 'orchestrator', description: 'Leads the team.', writes: ['/memories/'] } as AgentDefinition;
const sql = { ...base, name: 'sql', role: 'subagent', description: 'Reviews SQL code.', skills: ['kbagent', 'ghost'] } as AgentDefinition;
const builder = {
  ...base,
  name: 'builder',
  role: 'subagent',
  description: 'Builds agents.',
  approve: ['write_file'],
  model: 'cheap/model',
} as AgentDefinition;
const off = { ...base, name: 'off', role: 'subagent', description: 'Disabled one.', enabled: false } as AgentDefinition;

const skills: SkillInfo[] = [{ name: 'kbagent', description: 'CLI', sourceId: 'cli-kbagent', folder: 'kbagent' }];
const resolveTools = createToolResolver({});

describe('buildTeamSpec', () => {
  const spec = buildTeamSpec({ agents: [lead, sql, builder, off], skills, language: 'cs', resolveTools });

  it('builds the lead with the language rule and memory permissions', () => {
    expect(spec.lead.name).toBe('lead');
    expect(spec.lead.systemPrompt).toContain('Czech');
    expect(spec.lead.permissions[0]).toEqual({ operations: ['write'], paths: ['/memories/**'], mode: 'allow' });
  });

  it('includes enabled subagents only, with English prompts', () => {
    expect(spec.subagents.map((agent) => agent.name)).toEqual(['sql', 'builder']);
    expect(spec.subagents[0]?.systemPrompt).not.toContain('Czech');
  });

  it('maps skill names to virtual paths and reports unknown skills', () => {
    expect(spec.subagents[0]?.skills).toEqual(['/skills/cli-kbagent/kbagent/']);
    expect(spec.warnings).toContain('sql: unknown skill "ghost"');
  });

  it('turns approve entries into human-in-the-loop interrupts', () => {
    expect(spec.subagents[1]?.interruptOn).toEqual({ write_file: { allowedDecisions: ['approve', 'reject'] } });
    expect(spec.subagents[1]?.model).toBe('cheap/model');
  });

  it('fails without an enabled orchestrator', () => {
    expect(() => buildTeamSpec({ agents: [sql], skills, language: 'en', resolveTools })).toThrow(/orchestrator/);
  });
});
