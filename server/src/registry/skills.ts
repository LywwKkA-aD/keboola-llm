import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.ts';
import type { LoadError, LoadResult, SkillInfo, SkillSource } from './types.ts';

const subdirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted()
    : [];

/**
 * Skill folders, lowest priority first: vendored plugins (vendor/keboola/<repo>/plugins/<plugin>/skills)
 * and then the app's own skills/ folder, so local skills override upstream ones with the same name.
 */
export function discoverSkillSources(rootDir: string): SkillSource[] {
  const vendorRoot = join(rootDir, 'vendor', 'keboola');
  const vendored = subdirs(vendorRoot).flatMap((repo) =>
    subdirs(join(vendorRoot, repo, 'plugins'))
      .map((plugin) => ({ id: `${repo}-${plugin}`, dir: join(vendorRoot, repo, 'plugins', plugin, 'skills') }))
      .filter((source) => existsSync(source.dir)),
  );
  const custom = join(rootDir, 'skills');
  return existsSync(custom) ? [...vendored, { id: 'custom', dir: custom }] : vendored;
}

/** Read every <source>/<folder>/SKILL.md. Later sources override earlier ones with the same name. */
export function loadSkills(sources: readonly SkillSource[]): LoadResult<SkillInfo> {
  const found = sources.flatMap((source) =>
    subdirs(source.dir)
      .map((folder) => ({ source, folder, file: join(source.dir, folder, 'SKILL.md') }))
      .filter(({ file }) => existsSync(file))
      .map(({ source: { id }, folder, file }) => readSkill(id, folder, file)),
  );

  const byName = found.reduce(
    (acc, { skill, errors }) => ({
      skills: new Map(acc.skills).set(skill.name, skill),
      errors: [
        ...acc.errors,
        ...errors,
        ...(acc.skills.has(skill.name)
          ? [{ file: skill.sourceId, message: `skill "${skill.name}" from ${skill.sourceId} overrides ${acc.skills.get(skill.name)?.sourceId}` }]
          : []),
      ],
    }),
    { skills: new Map<string, SkillInfo>(), errors: [] as LoadError[] },
  );

  return { items: [...byName.skills.values()], errors: byName.errors };
}

function readSkill(sourceId: string, folder: string, file: string): { skill: SkillInfo; errors: LoadError[] } {
  try {
    const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : folder;
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const errors = description ? [] : [{ file, message: 'SKILL.md has no description; agents will not know when to use it' }];
    return { skill: { name, description, sourceId, folder }, errors };
  } catch (error) {
    return {
      skill: { name: folder, description: '', sourceId, folder },
      errors: [{ file, message: error instanceof Error ? error.message : String(error) }],
    };
  }
}
