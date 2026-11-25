import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createBackend, unsafeWritePath } from './backend.ts';

function setup() {
  const root = makeTree({
    'agents/lead/AGENT.md': '---\nname: lead\n---\nLead.',
    'data/knowledge/README.md': '# Knowledge\n',
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

  it('refuses names Windows would mangle: streams, device names, trailing dots and spaces', async () => {
    const { root, dataDir, skillSources } = setup();
    const backend = createBackend({ rootDir: root, dataDir, skillSources });
    for (const path of ['/knowledge/a.md:notes', '/knowledge/nul.md', '/knowledge/CON', '/knowledge/a.md.', '/knowledge/dir /a.md']) {
      const result = await backend.write(path, 'x');
      expect(result.error, path).toMatch(/cannot write/);
    }
    expect((await backend.edit('/knowledge/aux.md', 'a', 'b')).error).toMatch(/reserved name/);
    expect(await backend.uploadFiles([['/knowledge/com1.md', new Uint8Array([1])]])).toEqual([{ path: '/knowledge/com1.md', error: 'invalid_path' }]);

    // Ordinary names, Cyrillic included, still work.
    expect((await backend.write('/knowledge/how-to/загрузка заказов.md', '# Ok')).error).toBeUndefined();
    expect(existsSync(join(dataDir, 'knowledge', 'how-to', 'загрузка заказов.md'))).toBe(true);
    expect(unsafeWritePath('/knowledge/v1.2/notes.md')).toBeUndefined();
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

  it('creates missing folders so agents can write to them, with a README in the knowledge base', async () => {
    const root = makeTree({});
    const backend = createBackend({ rootDir: root, dataDir: join(root, 'data'), skillSources: [] });
    const listing = await backend.ls('/knowledge/');
    expect(listing.error).toBeUndefined();
    expect(listing.files?.map((file) => file.path)).toEqual(['/knowledge/README.md']);
    expect((await backend.ls('/memories/')).files?.map((file) => file.path)).toEqual(['/memories/AGENTS.md']);
  });

  it('keeps the knowledge base in the data dir, out of the repository', async () => {
    const root = makeTree({});
    const dataDir = join(root, 'data');
    const backend = createBackend({ rootDir: root, dataDir, skillSources: [] });

    expect((await backend.write('/knowledge/glossary.md', '# Glossary\n')).error).toBeUndefined();
    expect(readFileSync(join(dataDir, 'knowledge', 'glossary.md'), 'utf8')).toBe('# Glossary\n');
    expect(existsSync(join(root, 'knowledge'))).toBe(false);
  });

  it('brings notes over from the old in-repo knowledge folder on first start', async () => {
    const root = makeTree({ 'knowledge/data-model/sales.md': '# Sales\n' });
    const backend = createBackend({ rootDir: root, dataDir: join(root, 'data'), skillSources: [] });
    expect(String((await backend.read('/knowledge/data-model/sales.md')).content)).toContain('# Sales');
  });
});
