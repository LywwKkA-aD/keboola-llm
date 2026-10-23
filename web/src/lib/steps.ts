export type StepKind = 'read' | 'sql' | 'write' | 'delegate' | 'file' | 'auto' | 'tool';

const FILE_READS = new Set(['read_file', 'ls', 'glob', 'grep']);
const WRITES = new Set(['kbagent_write', 'write_file', 'edit_file']);

/** The badge of a step row: what kind of action the agent took. */
export function kindOf(step: { readonly kind: 'delegate' | 'tool' | 'auto'; readonly target: string }): StepKind {
  if (step.kind === 'delegate') return 'delegate';
  if (step.kind === 'auto') return 'auto';
  if (step.target === 'kbagent_read') return 'read';
  if (step.target === 'kbagent_sql') return 'sql';
  if (WRITES.has(step.target)) return 'write';
  if (FILE_READS.has(step.target)) return 'file';
  return 'tool';
}

/** Badge color per kind, as a chip modifier. */
export const KIND_TONE: Record<StepKind, '' | 'blue' | 'green' | 'amber' | 'red'> = {
  read: 'blue',
  sql: 'green',
  write: 'amber',
  delegate: 'blue',
  file: '',
  auto: 'green',
  tool: '',
};
