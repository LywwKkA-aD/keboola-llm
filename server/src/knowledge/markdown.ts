const HEADING = /^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/;
const FENCE = /^(```|~~~)/;

/** The first ATX heading outside front matter and fenced code, or the fallback. */
export function titleOf(content: string, fallback: string): string {
  const lines = content.split(/\r?\n/);
  let index = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, at) => at > 0 && line.trim() === '---');
    index = end > 0 ? end + 1 : 0;
  }
  let fence: string | undefined;
  for (const line of lines.slice(index)) {
    const marker = FENCE.exec(line.trim())?.[1];
    if (marker && (fence === undefined || marker === fence)) {
      fence = fence === undefined ? marker : undefined;
    } else if (fence === undefined) {
      const title = HEADING.exec(line)?.[1]?.trim();
      if (title) return title;
    }
  }
  return fallback;
}

/** Text as stored in a note: no byte order mark, LF line endings. */
export const cleanText = (text: string): string => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/** A plain-text upload as a Markdown note: titled after the file unless it starts with its own heading. */
export function textToMarkdown(name: string, text: string): string {
  const body = cleanText(text).trim();
  if (!body) return `# ${name}\n`;
  return HEADING.test(body.split('\n')[0] ?? '') ? `${body}\n` : `# ${name}\n\n${body}\n`;
}
