import { describe, expect, it } from 'vitest';
import type { AgentDefinition } from '../registry/types.ts';
import { describeTeam } from './team-info.ts';

const agent = {
  name: 'kbc-sql-reviewer',
  description: 'Reviews SQL.',
  role: 'subagent',
  enabled: true,
  skills: ['kbagent'],
  tools: ['kbagent'],
  writes: [],
  approve: [],
  keboola: { access: 'read' },
  avatar: { color: '#3D5AFE', prop: 'magnifier' },
  basedOn: 'vendor/x.md',
  prompt: 'secret-ish long prompt',
  file: '/abs/path/AGENT.md',
} as AgentDefinition;

describe('describeTeam', () => {
  it('exposes what the UI needs and nothing about prompts or local paths', () => {
    const info = describeTeam({
      lead: 'lead',
      agents: [agent],
      skills: [{ name: 'kbagent', description: 'CLI', sourceId: 'cli-kbagent', folder: 'kbagent' }],
      warnings: ['w'],
      loadErrors: [],
    });

    expect(info.agents).toEqual([
      {
        name: 'kbc-sql-reviewer',
        description: 'Reviews SQL.',
        role: 'subagent',
        enabled: true,
        skills: ['kbagent'],
        tools: ['kbagent'],
        access: 'read',
        avatar: { color: '#3D5AFE', prop: 'magnifier' },
        basedOn: 'vendor/x.md',
      },
    ]);
    expect(info.skills).toEqual([{ name: 'kbagent', description: 'CLI', source: 'cli-kbagent' }]);
    expect(JSON.stringify(info)).not.toContain('/abs/path');
  });
});
