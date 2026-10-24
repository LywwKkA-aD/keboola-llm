import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createBackend } from './backend.ts';

function setup() {
  const root = makeTree({
    'agents/lead/AGENT.md': '---\nname: lead\n---\nLead.',
    'knowledge/README.md': '# Knowledge\n',
    'vendor/skills/kbagent/SKILL.md': '---\nname: kbagent\n---\nUse kbagent.',
  });
  const dataDir = join(root, 'data');
  const skillSources = [{ id: 'cli-kbagent', dir: join(root, 'vendor', 'skills') }];
  return { root, dataDir, skillSources };
}

describe('createBackend', () => {
  it('routes skills, agents, knowledge, memories and routines to their folders', () => {
    const { root, dataDir, skillSources } = setup();
    const backend = createBackend({ rootDir: root, dataDir, skillSources });

    expect(backend.routePrefixes.toSorted()).toEqual(['/agents/', '/knowledge/', '/memories/', '/routines/', '/skills/cli-kbagent/']);
  });

  it('maps /routines/ to the repo routines folder', async () => {
    const { root, dataDir, skillSources } = setup();
    const backend = createBackend({ rootDir: root, dataDir, skillSources });

    await backend.write('/routines/nightly.md', '---\nname: nightly\n---\nCheck.');
    expect(readFileSync(join(root, 'routines', 'nightly.md'), 'utf8')).toContain('name: nightly');
  });

  it('reads files through the virtual paths', async () => {
    const { root, dataDir, skillSources } = setup();
    const backend = createBackend({ rootDir: root, dataDir, skillSources });

    const skill = await backend.read('/skills/cli-kbagent/kbagent/SKILL.md');
    const note = await backend.read('/knowledge/README.md');
    const agents = await backend.ls('/agents/');

    expect(skill.error).toBeUndefined();
    expect(String(skill.content)).toContain('Use kbagent.');
    expect(String(note.content)).toContain('# Knowledge');
    expect(agents.files?.map((file) => file.path)).toContain('/agents/lead/');
  });

  it('does not let a virtual path escape its folder', async () => {
    const { root, dataDir, skillSources } = setup();
    const backend = createBackend({ rootDir: root, dataDir, skillSources });

    const escaped = await backend.read('/knowledge/../agents/lead/AGENT.md');
    expect(escaped.content).toBeUndefined();
  });

  it('creates the shared memory file once and never overwrites it', () => {
    const { root, dataDir, skillSources } = setup();
    createBackend({ rootDir: root, dataDir, skillSources });
    const memoryFile = join(dataDir, 'memories', 'AGENTS.md');
    expect(readFileSync(memoryFile, 'utf8')).toMatch(/^# Shared memory/);

    writeFileSync(memoryFile, '# Shared memory\n\n- The user prefers CTEs.\n');
    createBackend({ rootDir: root, dataDir, skillSources });
    expect(readFileSync(memoryFile, 'utf8')).toContain('prefers CTEs');
  });

  it('creates missing folders so agents can write to them', async () => {
    const root = makeTree({});
    const backend = createBackend({ rootDir: root, dataDir: join(root, 'data'), skillSources: [] });
    const listing = await backend.ls('/knowledge/');
    expect(listing.error).toBeUndefined();
    expect(listing.files).toEqual([]);
  });
});
