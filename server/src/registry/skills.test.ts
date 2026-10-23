import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { discoverSkillSources, loadSkills } from './skills.ts';

const skill = (name: string, description = `Use for ${name} tasks.`) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

describe('discoverSkillSources', () => {
  it('finds custom skills and every vendored plugin skills folder', () => {
    const root = makeTree({
      'skills/mine/SKILL.md': skill('mine'),
      'vendor/keboola/cli/plugins/kbagent/skills/kbagent/SKILL.md': skill('kbagent'),
      'vendor/keboola/ai-kit/plugins/keboola-cli/skills/keboola-config/SKILL.md': skill('keboola-config'),
      'vendor/keboola/ai-kit/plugins/no-skills/README.md': 'x',
    });

    expect(discoverSkillSources(root).map((source) => source.id)).toEqual([
      'ai-kit-keboola-cli',
      'cli-kbagent',
      'custom',
    ]);
  });

  it('works when neither folder exists', () => {
    expect(discoverSkillSources(makeTree({}))).toEqual([]);
  });
});

describe('loadSkills', () => {
  it('reads name and description from each SKILL.md', () => {
    const root = makeTree({
      'skills/sql-style/SKILL.md': skill('sql-style', 'House SQL style rules.'),
      'skills/not-a-skill/notes.md': 'x',
    });
    const { items, errors } = loadSkills(discoverSkillSources(root));

    expect(errors).toEqual([]);
    expect(items).toEqual([
      { name: 'sql-style', description: 'House SQL style rules.', sourceId: 'custom', folder: 'sql-style' },
    ]);
  });

  it('falls back to the folder name and reports a missing description', () => {
    const root = makeTree({ 'skills/bare/SKILL.md': '# no frontmatter' });
    const { items, errors } = loadSkills(discoverSkillSources(root));

    expect(items[0]).toMatchObject({ name: 'bare', description: '' });
    expect(errors[0]?.message).toMatch(/description/);
  });

  it('lets later sources override duplicates and reports them', () => {
    const root = makeTree({
      'vendor/keboola/cli/plugins/kbagent/skills/kbagent/SKILL.md': skill('kbagent', 'Upstream.'),
      'skills/kbagent/SKILL.md': skill('kbagent', 'Local override.'),
    });
    const { items, errors } = loadSkills(discoverSkillSources(root));

    expect(items).toEqual([{ name: 'kbagent', description: 'Local override.', sourceId: 'custom', folder: 'kbagent' }]);
    expect(errors[0]?.message).toMatch(/overrides/);
  });
});
