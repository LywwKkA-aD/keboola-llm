import { describe, expect, it } from 'vitest';
import { createPathFilter } from './path-filter.mjs';

describe('createPathFilter', () => {
  const filter = createPathFilter({
    include: ['^LICENSE$', '^plugins/'],
    exclude: ['^plugins/[^/]+/evals/'],
  });

  it('includes paths matching an include pattern', () => {
    expect(filter('LICENSE')).toBe(true);
    expect(filter('plugins/keboola-cli/agents/kbc-sql-reviewer.md')).toBe(true);
  });

  it('rejects paths matching no include pattern', () => {
    expect(filter('README.md')).toBe(false);
    expect(filter('docs/plan.md')).toBe(false);
    expect(filter('LICENSE.bak')).toBe(false);
  });

  it('lets exclude patterns win over include patterns', () => {
    expect(filter('plugins/keboola-cli/evals/keboola-config/trigger-evals.json')).toBe(false);
  });

  it('normalizes Windows separators before matching', () => {
    expect(filter('plugins\\kbagent\\skills\\kbagent\\SKILL.md')).toBe(true);
    expect(filter('plugins\\kbagent\\evals\\x.json')).toBe(false);
  });

  it('treats a missing exclude list as empty', () => {
    const includeOnly = createPathFilter({ include: ['^a/'] });
    expect(includeOnly('a/b.md')).toBe(true);
  });
});
