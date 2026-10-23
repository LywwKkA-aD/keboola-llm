import type { BusEvent, Envelope } from '../api/types.ts';

/** A looping scripted session that exercises every station; used by the preview and a "demo" switch. */
const SCRIPT: readonly BusEvent[][] = [
  [{ type: 'run.started', runId: 'demo' }],
  [{ type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Find where customer_id is used' }],
  [{ type: 'tool.start', agent: 'keboola-expert', callId: 't1', tool: 'kbagent_read', args: { purpose: 'Search configs for customer_id' } }],
  [{ type: 'delegate.start', agent: 'lead', callId: 'd2', to: 'knowledge-keeper', task: 'Look up the glossary' }],
  [{ type: 'tool.start', agent: 'knowledge-keeper', callId: 't2', tool: 'read_file', args: { file_path: '/knowledge/glossary.md' } }],
  [{ type: 'delegate.start', agent: 'lead', callId: 'd3', to: 'kbc-sql-reviewer', task: 'Review Shop 02 SQL' }],
  [{ type: 'tool.start', agent: 'kbc-sql-reviewer', callId: 't3', tool: 'kbagent_sql', args: { purpose: 'Count duplicated order rows' } }],
  [
    { type: 'tool.end', agent: 'keboola-expert', callId: 't1', tool: 'kbagent_read', ok: true, preview: '' },
    { type: 'delegate.end', agent: 'lead', callId: 'd1', to: 'keboola-expert', ok: true },
  ],
  [
    { type: 'delegate.start', agent: 'lead', callId: 'd4', to: 'agent-builder', task: 'Draft a data-contract agent' },
    { type: 'tool.start', agent: 'agent-builder', callId: 't4', tool: 'write_file', args: { file_path: '/agents/data-contracts/AGENT.md' } },
  ],
  [{ type: 'approval.required', interruptId: 'demo-approval', requests: [{ tool: 'write_file', args: {}, decisions: ['approve', 'reject'] }] }],
  [
    { type: 'tool.end', agent: 'knowledge-keeper', callId: 't2', tool: 'read_file', ok: true, preview: '' },
    { type: 'delegate.end', agent: 'lead', callId: 'd2', to: 'knowledge-keeper', ok: true },
  ],
  [
    { type: 'tool.end', agent: 'agent-builder', callId: 't4', tool: 'write_file', ok: true, preview: '' },
    { type: 'delegate.end', agent: 'lead', callId: 'd4', to: 'agent-builder', ok: true },
  ],
  [
    { type: 'tool.end', agent: 'kbc-sql-reviewer', callId: 't3', tool: 'kbagent_sql', ok: true, preview: '' },
    { type: 'delegate.end', agent: 'lead', callId: 'd3', to: 'kbc-sql-reviewer', ok: true },
  ],
  [{ type: 'run.finished', runId: 'demo' }],
  [],
];

export const DEMO_THREAD = 'demo';

/** Envelopes for one tick of the demo; the script loops forever. */
export function demoTick(step: number): Envelope[] {
  const events = SCRIPT[step % SCRIPT.length] ?? [];
  return events.map((event, index) => ({ seq: step * 10 + index, threadId: DEMO_THREAD, event }));
}

export const DEMO_LENGTH = SCRIPT.length;
