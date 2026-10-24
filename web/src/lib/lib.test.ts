import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../api/types.ts';
import { groupOf, groupTeam } from './agent-groups.ts';
import { formatDuration, formatTokens } from './format.ts';
import { kindOf } from './steps.ts';

const agent = (name: string, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  name,
  description: 'd',
  role: 'subagent',
  enabled: true,
  skills: [],
  tools: [],
  ...extra,
});

describe('groupOf', () => {
  it.each([
    [agent('lead', { role: 'orchestrator' }), 'lead'],
    [agent('keboola-expert', { tools: ['kbagent'] }), 'keboola'],
    [agent('kbc-dwh-architect', { tools: ['kbagent', 'kbagent-sql'] }), 'keboola'],
    [agent('kbc-sql-reviewer', { tools: ['kbagent'] }), 'reviewers'],
    [agent('kbc-security-auditor', { tools: ['kbagent'] }), 'reviewers'],
    [agent('kbc-performance-optimizer', { tools: ['kbagent'] }), 'reviewers'],
    [agent('kbc-review-consolidator', { tools: ['kbagent'] }), 'reviewers'],
    [agent('agent-builder'), 'knowledge'],
    [agent('knowledge-keeper'), 'knowledge'],
    [agent('tester', { enabled: false }), 'disabled'],
    [agent('lead2', { role: 'orchestrator', enabled: false }), 'disabled'],
  ])('%s', (input, expected) => {
    expect(groupOf(input)).toBe(expected);
  });
});

describe('groupTeam', () => {
  it('orders groups and agents, leaving out empty groups', () => {
    const groups = groupTeam([agent('z-keeper'), agent('keboola-expert', { tools: ['kbagent'] }), agent('lead', { role: 'orchestrator' }), agent('a-keeper')]);
    expect(groups.map(({ group, agents }) => [group, agents.map((a) => a.name)])).toEqual([
      ['lead', ['lead']],
      ['keboola', ['keboola-expert']],
      ['knowledge', ['a-keeper', 'z-keeper']],
    ]);
  });
});

describe('kindOf', () => {
  it.each([
    ['delegate', 'task', 'delegate'],
    ['tool', 'kbagent_read', 'read'],
    ['tool', 'kbagent_sql', 'sql'],
    ['tool', 'kbagent_write', 'write'],
    ['tool', 'write_file', 'write'],
    ['tool', 'edit_file', 'write'],
    ['tool', 'read_file', 'file'],
    ['tool', 'grep', 'file'],
    ['tool', 'write_todos', 'plan'],
    ['tool', 'request_plan_approval', 'plan'],
    ['auto', 'kbagent_sql', 'auto'],
  ] as const)('%s %s -> %s', (kind, target, expected) => {
    expect(kindOf({ kind, target })).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [undefined, ''],
    [-5, ''],
    [240, '240 ms'],
    [1250, '1.3 s'],
    [59_400, '59.4 s'],
    [125_000, '2 min 5 s'],
  ])('%s -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatTokens', () => {
  it('shortens large counts', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12_340)).toBe('12.3k');
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});
