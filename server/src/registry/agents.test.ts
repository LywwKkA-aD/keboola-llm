import { describe, expect, it } from 'vitest';
import { agentMd, makeTree } from '../test-utils/tree.ts';
import { loadAgents } from './agents.ts';

const orchestrator = agentMd('name: lead\nrole: orchestrator\ndescription: Leads the team and talks to the user.');
const helper = agentMd('name: helper\ndescription: Helps with things in a focused way.\nskills: [kbagent]\ntools: [kbagent]');

describe('loadAgents', () => {
  it('loads agent definitions with defaults applied', () => {
    const root = makeTree({ 'agents/lead/AGENT.md': orchestrator, 'agents/helper/AGENT.md': helper });
    const { items, errors } = loadAgents(root);

    expect(errors).toEqual([]);
    expect(items.map((agent) => agent.name)).toEqual(['helper', 'lead']);
    expect(items.find((agent) => agent.name === 'helper')).toMatchObject({
      role: 'subagent',
      enabled: true,
      skills: ['kbagent'],
      tools: ['kbagent'],
      writes: [],
      prompt: 'Do the job well.',
    });
  });

  it('composes the prompt of an agent that extends an upstream file', () => {
    const root = makeTree({
      'agents/lead/AGENT.md': orchestrator,
      'vendor/keboola/x/agents/reviewer.md': '---\nname: upstream\ntools: Read, Bash\n---\n\nUpstream instructions.',
      'agents/reviewer/AGENT.md': agentMd(
        'name: reviewer\ndescription: Reviews SQL transformations.\nextends: vendor/keboola/x/agents/reviewer.md',
        'Use kbagent_read instead of kbc.',
      ),
    });
    const reviewer = loadAgents(root).items.find((agent) => agent.name === 'reviewer');

    expect(reviewer?.prompt).toBe('Upstream instructions.\n\n## Adaptation for this app\n\nUse kbagent_read instead of kbc.');
    expect(reviewer?.basedOn).toBe('vendor/keboola/x/agents/reviewer.md');
  });

  it('rejects extends paths outside vendor/ and agents/', () => {
    const root = makeTree({
      'agents/lead/AGENT.md': orchestrator,
      'secrets.md': 'nope',
      'agents/bad/AGENT.md': agentMd('name: bad\ndescription: Tries to escape the sandbox.\nextends: ../secrets.md'),
    });
    const { items, errors } = loadAgents(root);

    expect(items.map((agent) => agent.name)).toEqual(['lead']);
    expect(errors[0]?.message).toMatch(/extends/);
  });

  it('reports a missing upstream file', () => {
    const root = makeTree({
      'agents/lead/AGENT.md': orchestrator,
      'agents/gone/AGENT.md': agentMd('name: gone\ndescription: Points to a missing file.\nextends: vendor/missing.md'),
    });
    expect(loadAgents(root).errors[0]?.message).toMatch(/not found/);
  });

  it('reports schema errors and keeps loading the rest', () => {
    const root = makeTree({
      'agents/lead/AGENT.md': orchestrator,
      'agents/broken/AGENT.md': agentMd('name: broken\ndescription: short\nunknownField: 1'),
    });
    const { items, errors } = loadAgents(root);

    expect(items.map((agent) => agent.name)).toEqual(['lead']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toMatch(/broken[\\/]AGENT\.md$/);
  });

  it('reports invalid YAML without crashing', () => {
    const root = makeTree({ 'agents/lead/AGENT.md': orchestrator, 'agents/yaml/AGENT.md': '---\nname: [x\n---\nB' });
    expect(loadAgents(root).errors).toHaveLength(1);
  });

  it('requires the folder name to match the agent name', () => {
    const root = makeTree({
      'agents/lead/AGENT.md': orchestrator,
      'agents/folder/AGENT.md': agentMd('name: other\ndescription: Name does not match the folder.'),
    });
    expect(loadAgents(root).errors[0]?.message).toMatch(/folder/);
  });

  it('requires exactly one enabled orchestrator', () => {
    const none = makeTree({ 'agents/helper/AGENT.md': helper });
    expect(loadAgents(none).errors.map((error) => error.message)).toContain('Exactly one enabled orchestrator is required, found 0');

    const two = makeTree({
      'agents/lead/AGENT.md': orchestrator,
      'agents/lead2/AGENT.md': agentMd('name: lead2\nrole: orchestrator\ndescription: A second lead agent here.'),
    });
    expect(loadAgents(two).errors.map((error) => error.message)).toContain('Exactly one enabled orchestrator is required, found 2');
  });

  it('returns nothing when the agents folder does not exist', () => {
    const { items, errors } = loadAgents(makeTree({}));
    expect(items).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
