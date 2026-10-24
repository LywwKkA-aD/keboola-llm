import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { definitionFile, definitionNames, readDefinition, writeDefinition } from './files.ts';

describe('definition files', () => {
  it('maps a kind and a name to its file', () => {
    expect(definitionFile('/root', 'agents', 'lead')).toBe(join('/root', 'agents', 'lead', 'AGENT.md'));
    expect(definitionFile('/root', 'skills', 'sql-style')).toBe(join('/root', 'skills', 'sql-style', 'SKILL.md'));
  });

  it('refuses names that could leave the folder', () => {
    ['../etc', 'a/b', 'A', '-x', 'x', '', 'a\\b', '..'].forEach((name) => {
      expect(() => definitionFile('/root', 'agents', name)).toThrow(/Invalid definition name/);
    });
  });

  it('lists only folders with a valid name that hold the definition file', () => {
    const root = makeTree({
      'agents/lead/AGENT.md': 'a',
      'agents/scout/AGENT.md': 'b',
      'agents/empty/notes.md': 'c',
      'agents/Bad_Name/AGENT.md': 'd',
      'agents/README.md': 'e',
      'skills/sql-style/SKILL.md': 'f',
      'skills/README.md': 'g',
    });

    expect(definitionNames(root, 'agents')).toEqual(['lead', 'scout']);
    expect(definitionNames(root, 'skills')).toEqual(['sql-style']);
    expect(definitionNames(makeTree({}), 'skills')).toEqual([]);
  });

  it('reads a definition, or nothing when it is gone', () => {
    const root = makeTree({ 'agents/lead/AGENT.md': 'hello' });
    expect(readDefinition(root, 'agents', 'lead')).toBe('hello');
    expect(readDefinition(root, 'agents', 'ghost')).toBeUndefined();
  });

  it('writes atomically and recreates a deleted folder', () => {
    const root = makeTree({ 'agents/lead/AGENT.md': 'old' });
    writeDefinition(root, 'agents', 'lead', 'new');
    writeDefinition(root, 'skills', 'back', 'restored');

    expect(readFileSync(join(root, 'agents', 'lead', 'AGENT.md'), 'utf8')).toBe('new');
    expect(readFileSync(join(root, 'skills', 'back', 'SKILL.md'), 'utf8')).toBe('restored');
    expect(readdirSync(join(root, 'agents', 'lead'))).toEqual(['AGENT.md']);
    expect(existsSync(join(root, 'skills', 'back'))).toBe(true);
  });
});
