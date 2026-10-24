import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { KNOWLEDGE_README, seedKnowledge } from './seed.ts';

describe('seedKnowledge', () => {
  it('creates the folder with a README on first start', () => {
    const root = makeTree({});
    const dir = join(root, 'data', 'knowledge');
    expect(seedKnowledge(dir, join(root, 'knowledge'))).toBe('seeded');
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(KNOWLEDGE_README);
    expect(KNOWLEDGE_README).toMatch(/^# Knowledge base/);
  });

  it('never touches an existing folder, even one without a README', () => {
    const root = makeTree({ 'data/knowledge/glossary.md': '# Glossary' });
    const dir = join(root, 'data', 'knowledge');
    expect(seedKnowledge(dir, join(root, 'knowledge'))).toBe('kept');
    expect(readdirSync(dir)).toEqual(['glossary.md']);
  });

  it('copies notes from the old in-repo folder once, leaving the originals', () => {
    const root = makeTree({ 'knowledge/README.md': '# Old readme', 'knowledge/data-model/sales.md': '# Sales' });
    const dir = join(root, 'data', 'knowledge');
    expect(seedKnowledge(dir, join(root, 'knowledge'))).toBe('copied');
    expect(readFileSync(join(dir, 'data-model', 'sales.md'), 'utf8')).toBe('# Sales');
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('# Old readme');
    expect(existsSync(join(root, 'knowledge', 'data-model', 'sales.md'))).toBe(true);

    // Deleting a note later must not bring it back from the old folder.
    rmSync(join(dir, 'data-model'), { recursive: true });
    expect(seedKnowledge(dir, join(root, 'knowledge'))).toBe('kept');
    expect(existsSync(join(dir, 'data-model'))).toBe(false);
  });

  it('adds the README when the old folder had none', () => {
    const root = makeTree({ 'knowledge/glossary.md': '# Glossary' });
    const dir = join(root, 'data', 'knowledge');
    seedKnowledge(dir, join(root, 'knowledge'));
    expect(readdirSync(dir).toSorted()).toEqual(['README.md', 'glossary.md']);
  });

  it('does not copy links out of the old folder', ({ skip }) => {
    const root = makeTree({ 'knowledge/ok.md': '# Ok', 'secret/token.md': 'secret' });
    try {
      symlinkSync(join(root, 'secret'), join(root, 'knowledge', 'linked'), 'junction');
    } catch {
      skip();
    }
    const dir = join(root, 'data', 'knowledge');
    seedKnowledge(dir, join(root, 'knowledge'));
    expect(readdirSync(dir).toSorted()).toEqual(['README.md', 'ok.md']);
  });

  it('seeds the README when the old folder is empty', () => {
    const root = makeTree({ 'knowledge/.keep': '' });
    const dir = join(root, 'data', 'knowledge');
    expect(seedKnowledge(dir, join(root, 'knowledge'))).toBe('seeded');
    expect(readdirSync(dir)).toEqual(['README.md']);
  });
});
