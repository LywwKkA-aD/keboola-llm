import { AIMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from '../runtime/events.ts';
import { createEventBus, type Envelope } from './bus.ts';
import { createRunManager, MAX_AUTO_RESUMES, type StreamingGraph } from './runs.ts';

const finalMessage = [[], 'updates', { model_request: { messages: [new AIMessage({ content: 'Hi!', name: 'lead' })] } }];
const interrupt = [
  [],
  'updates',
  {
    __interrupt__: [
      { id: 'int-1', value: { actionRequests: [{ name: 'write_file', args: {} }], reviewConfigs: [{ actionName: 'write_file', allowedDecisions: ['approve', 'reject'] }] } },
    ],
  },
];

function fakeGraph(script: (input: unknown) => unknown[] | Error) {
  const inputs: unknown[] = [];
  const graph: StreamingGraph = {
    async stream(input) {
      inputs.push(input);
      const result = script(input);
      if (result instanceof Error) throw result;
      return (async function* () {
        yield* result;
      })();
    },
  };
  return { graph, inputs };
}

function setup(script: (input: unknown) => unknown[] | Error, autoApprove?: (threadId: string, request: ApprovalRequest) => boolean) {
  const bus = createEventBus({ historyPerThread: 100 });
  const events: Envelope[] = [];
  bus.subscribe((envelope) => events.push(envelope));
  const { graph, inputs } = fakeGraph(script);
  const runs = createRunManager({ bus, getGraph: () => graph, leadName: () => 'lead', ...(autoApprove ? { autoApprove } : {}) });
  const types = () => events.map((envelope) => envelope.event.type);
  return { runs, events, inputs, types };
}

describe('createRunManager', () => {
  it('streams a run into the bus and finishes it', async () => {
    const { runs, types } = setup(() => [finalMessage]);
    const { runId, done } = runs.start('t1', { messages: [] });
    await done;

    expect(runId).toMatch(/[0-9a-f-]{36}/);
    expect(types()).toEqual(['run.started', 'message', 'run.finished']);
    expect(runs.isBusy('t1')).toBe(false);
  });

  it('refuses a second run on a busy thread', async () => {
    const { runs } = setup(() => [finalMessage]);
    const first = runs.start('t1', {});
    expect(() => runs.start('t1', {})).toThrow(/busy/);
    await first.done;
  });

  it('waits for approvals and resumes with the answers', async () => {
    const { runs, inputs, types } = setup((input) => (input instanceof Command ? [finalMessage] : [interrupt]));
    await runs.start('t1', {}).done;

    expect(types()).toEqual(['run.started', 'approval.required', 'run.waiting']);
    expect(runs.pending('t1').map((approval) => approval.interruptId)).toEqual(['int-1']);
    expect(runs.isBusy('t1')).toBe(true);
    expect(() => runs.start('t1', {})).toThrow(/approval/);

    await runs.answer('t1', [{ interruptId: 'int-1', decisions: [{ type: 'approve' }] }]).done;
    expect((inputs[1] as Command).resume).toEqual({ decisions: [{ type: 'approve' }] });
    expect(runs.pending('t1')).toEqual([]);
    expect(types().at(-1)).toBe('run.finished');
  });

  it('validates answers against the pending interrupts', async () => {
    const { runs } = setup(() => [interrupt]);
    await runs.start('t1', {}).done;

    expect(() => runs.answer('t1', [{ interruptId: 'other', decisions: [{ type: 'approve' }] }])).toThrow(/interrupt/);
    expect(() => runs.answer('t1', [{ interruptId: 'int-1', decisions: [] }])).toThrow(/decision/);
    expect(() => runs.answer('t2', [])).toThrow(/No pending/);
  });

  it('reports failures without throwing', async () => {
    const { runs, events } = setup(() => new Error('model down'));
    await runs.start('t1', {}).done;
    expect(events.at(-1)?.event).toMatchObject({ type: 'run.failed', error: 'model down' });
    expect(runs.isBusy('t1')).toBe(false);
  });

  it('can cancel a running thread', async () => {
    const bus = createEventBus({ historyPerThread: 10 });
    const graph: StreamingGraph = {
      async stream(_input, options) {
        return (async function* () {
          await new Promise((resolve, reject) => {
            if (options.signal?.aborted) reject(new Error('aborted'));
            options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            setTimeout(resolve, 5000);
          });
          yield finalMessage;
        })();
      },
    };
    const runs = createRunManager({ bus, getGraph: () => graph, leadName: () => 'lead' });
    const { done } = runs.start('t1', {});
    expect(runs.cancel('t1')).toBe(true);
    await done;
    expect(runs.isBusy('t1')).toBe(false);
    expect(runs.cancel('t1')).toBe(false);
  });
});

describe('createRunManager with auto-approval', () => {
  const sqlRequest = { name: 'kbagent_sql', args: { args: ['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1'], purpose: 'q' } };
  const writeRequest = { name: 'write_file', args: { file_path: '/agents/x/AGENT.md' } };
  const configs = [
    { actionName: 'kbagent_sql', allowedDecisions: ['approve', 'reject'] },
    { actionName: 'write_file', allowedDecisions: ['approve', 'reject'] },
  ];
  const interruptOf = (id: string, requests: object[]) => ({ id, value: { actionRequests: requests, reviewConfigs: configs } });
  const chunkOf = (...interrupts: object[]) => [[], 'updates', { __interrupt__: interrupts }];
  const onlySql = (_threadId: string, request: ApprovalRequest) => request.tool === 'kbagent_sql';
  const approve = { type: 'approve' };

  it('answers fully auto-approvable interrupts itself and keeps one run', async () => {
    const { runs, inputs, types, events } = setup(
      (input) => (input instanceof Command ? [finalMessage] : [chunkOf(interruptOf('s1', [sqlRequest]))]),
      onlySql,
    );
    await runs.start('t1', {}).done;

    expect(types()).toEqual(['run.started', 'approval.auto', 'message', 'run.finished']);
    expect(events[1]?.event).toMatchObject({ type: 'approval.auto', interruptId: 's1', requests: [{ tool: 'kbagent_sql' }] });
    expect((inputs[1] as Command).resume).toEqual({ decisions: [approve] });
    expect(runs.pending('t1')).toEqual([]);
    expect(runs.isBusy('t1')).toBe(false);
  });

  it('leaves the human part pending and resumes both interrupts together', async () => {
    const { runs, inputs, types } = setup(
      (input) =>
        input instanceof Command ? [finalMessage] : [chunkOf(interruptOf('s1', [sqlRequest]), interruptOf('w1', [writeRequest]))],
      onlySql,
    );
    await runs.start('t1', {}).done;

    expect(types()).toEqual(['run.started', 'approval.auto', 'approval.required', 'run.waiting']);
    expect(runs.pending('t1').map((approval) => approval.interruptId)).toEqual(['w1']);

    await runs.answer('t1', [{ interruptId: 'w1', decisions: [{ type: 'reject', message: 'no' }] }]).done;
    expect((inputs[1] as Command).resume).toEqual({
      s1: { decisions: [approve] },
      w1: { decisions: [{ type: 'reject', message: 'no' }] },
    });
  });

  it('keeps an interrupt pending when only some of its requests are auto-approvable', async () => {
    const { runs, types } = setup(() => [chunkOf(interruptOf('m1', [sqlRequest, writeRequest]))], onlySql);
    await runs.start('t1', {}).done;

    expect(types()).toEqual(['run.started', 'approval.required', 'run.waiting']);
    expect(runs.pending('t1')[0]?.requests).toHaveLength(2);
  });

  it('stops a run that keeps asking for automatic approvals', async () => {
    let calls = 0;
    const { runs, events } = setup(() => {
      calls += 1;
      return [chunkOf(interruptOf(`s${calls}`, [sqlRequest]))];
    }, onlySql);
    await runs.start('t1', {}).done;

    expect(calls).toBe(MAX_AUTO_RESUMES + 1);
    expect(events.at(-1)?.event).toMatchObject({ type: 'run.failed', error: expect.stringMatching(/automatic approvals/) });
    expect(runs.isBusy('t1')).toBe(false);
  });
});
