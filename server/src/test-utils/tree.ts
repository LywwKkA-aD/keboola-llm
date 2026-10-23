import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Create a temp directory populated with the given relative-path -> content map. */
export function makeTree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'keboola-llm-test-'));
  Object.entries(files).forEach(([rel, content]) => {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  });
  return root;
}

export const agentMd = (frontmatter: string, body = 'Do the job well.'): string =>
  `---\n${frontmatter.trim()}\n---\n\n${body}\n`;
