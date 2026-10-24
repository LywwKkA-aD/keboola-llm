const MARKER = /\s*\bDisabled:\s*/;

/**
 * Disabled agents explain themselves in their description: "<role>. Disabled: <reason>"
 * (see agents/component-builder/AGENT.md). Split the two so the reason can stand out.
 */
export function splitDisabled(description: string): { role: string; reason?: string } {
  const match = MARKER.exec(description);
  const reason = match ? description.slice(match.index + match[0].length).trim() : '';
  if (!match || !reason) return { role: description.trim() };
  return { role: description.slice(0, match.index).trim(), reason };
}

export const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
