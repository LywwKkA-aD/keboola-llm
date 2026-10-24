import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const KNOWLEDGE_README = `# Knowledge base

Markdown notes shared by all agents. knowledge-keeper maintains them; you can read, edit and upload notes on
the Knowledge page of Agent Studio.

- \`glossary.md\` - business and data terms
- \`data-model/\` - what the important tables mean, by area
- \`conventions/\` - naming, SQL style, branching rules
- \`how-to/\` - step-by-step guides for recurring tasks
- \`decisions/\` - dated decisions and their reasons

No secrets, tokens, passwords or personal data.
`;

const visibleEntries = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((name) => !name.startsWith('.'));
  } catch {
    return [];
  }
};

/**
 * Create the knowledge folder (in the data dir, out of git) on first start. Notes an older version kept in
 * <repo>/knowledge are copied over once, links and hidden files left out; the originals stay where they are.
 */
export function seedKnowledge(dir: string, legacyDir?: string): 'kept' | 'copied' | 'seeded' {
  if (existsSync(dir)) return 'kept';
  mkdirSync(dir, { recursive: true });
  const legacy = legacyDir ? visibleEntries(legacyDir) : [];
  if (legacyDir && legacy.length > 0) {
    cpSync(legacyDir, dir, {
      recursive: true,
      filter: (source) => source === legacyDir || (!basename(source).startsWith('.') && !lstatSync(source).isSymbolicLink()),
    });
  }
  if (!existsSync(join(dir, 'README.md'))) writeFileSync(join(dir, 'README.md'), KNOWLEDGE_README);
  return legacy.length > 0 ? 'copied' : 'seeded';
}
