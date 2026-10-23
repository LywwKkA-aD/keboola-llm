import { describe, expect, it } from 'vitest';
import { permissionsFor, skillPath } from './paths.ts';

describe('skillPath', () => {
  it('maps a skill to its virtual folder', () => {
    expect(skillPath({ name: 'kbagent', description: 'd', sourceId: 'cli-kbagent', folder: 'kbagent' })).toBe(
      '/skills/cli-kbagent/kbagent/',
    );
  });
});

describe('permissionsFor', () => {
  it('denies writes to every protected root by default', () => {
    expect(permissionsFor([])).toEqual([
      { operations: ['write'], paths: ['/skills/**', '/agents/**', '/knowledge/**', '/memories/**'], mode: 'deny' },
    ]);
  });

  it('allows the declared prefixes before the deny rule (first match wins)', () => {
    const rules = permissionsFor(['/agents/', '/skills/custom']);
    expect(rules.slice(0, 2)).toEqual([
      { operations: ['write'], paths: ['/agents/**'], mode: 'allow' },
      { operations: ['write'], paths: ['/skills/custom/**'], mode: 'allow' },
    ]);
    expect(rules[2]?.mode).toBe('deny');
  });
});
