/**
 * Continuing a run against the real deepagents graph and SQLite checkpointer, with scripted models:
 * LangGraph resumes from the last checkpoint when the thread is streamed again with a null input.
 */
import { join } from 'node:path';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { describe, expect, it } from 'vitest';
import { createEventBus, type Envelope } from '../api/bus.ts';
import { toChatHistory } from '../api/history.ts';
import { hasUnfinishedRun, type ProgressReader } from '../api/restore.ts';
import { createRunManager, type StreamingGraph } from '../api/runs.ts';
import type { AgentDefinition } from '../registry/types.ts';
import { type Script, ScriptedModel, toolCall } from '../test-utils/scripted-model.ts';
import { makeTree } from '../test-utils/tree.ts';
import { createToolResolver } from '../tools/catalog.ts';
import { createBackend } from './backend.ts';
import { buildTeamSpec, createTeam } from './team.ts';

const base = { enabled: true, skills: [], tools: [], writes: [], approve: [], prompt: 'Body.', file: '' };
const leadDef = { ...base, name: 'lead', role: 'orchestrator', description: 'Leads the team.' } as AgentDefinition;
const helperDef = {
  ...base,
  name: 'helper',
  role: 'subagent',
  description: 'Helps the lead.',
  model: 'helper-model',
  approve: ['write_file'],
} as AgentDefinition;

/** The graph as the app uses it: streamed by the run manager, its state read for history and after a restart. */
interface Graph extends StreamingGraph, ProgressReader {
  getState(config: { configurable: { thread_id: string } }): Promise<{
    next: readonly string[];
    tasks: readonly { interrupts: readonly unknown[] }[];
    values: { messages?: BaseMessage[] };
  }>;
}

/** A team over a checkpoint file; building it again over the same dir is what a server restart does. */
function team(dir: string, lead: Script, helper: Script = () => new AIMessage('ok')) {
  const spec = buildTeamSpec({ agents: [leadDef, helperDef], skills: [], language: 'en', resolveTools: createToolResolver({}) });
  const models = { lead: new ScriptedModel(lead), helper: new ScriptedModel(helper) };
  const graph = createTeam({
    spec,
    createModel: (id) => (id === 'helper-model' ? models.helper : models.lead),
    backend: createBackend({ rootDir: dir, dataDir: dir, skillSources: [] }),
    checkpointer: SqliteSaver.fromConnString(join(dir, 'checkpoints.sqlite')),
  }) as unknown as Graph;
  const bus = createEventBus({ historyPerThread: 500 });
  const events: Envelope[] = [];
  bus.subscribe((envelope) => events.push(envelope));
  const runs = createRunManager({ bus, getGraph: () => graph, leadName: () => 'lead' });
  const runEvents = () => events.map((envelope) => envelope.event).filter((event) => event.type.startsWith('run.'));
  return { graph, models, runs, runEvents };
}

const config = (threadId: string) => ({ configurable: { thread_id: threadId } });
const ask = (text: string) => ({ messages: [{ role: 'user', content: text }] });
const unavailable = () => Object.assign(new Error('503 upstream overloaded'), { status: 503 });
const kinds = (messages: readonly BaseMessage[] = []) => messages.map((message) => message.getType());

describe('continuing a run on the real graph', () => {
  it('continues after the lead model failed, without asking the question twice', async () => {
    const { graph, models, runs, runEvents } = team(makeTree({}), (_messages, call) => (call === 1 ? unavailable() : new AIMessage('Done.')));

    await runs.start('t1', ask('How many orders?')).done;
    expect(runEvents().at(-1)).toMatchObject({ type: 'run.failed', reason: 'model_unavailable' });
    expect(await hasUnfinishedRun(graph, 't1')).toBe(true);

    await runs.resume('t1').done;
    expect(runEvents().slice(-2)).toEqual([
      { type: 'run.started', runId: expect.any(String), resume: true },
      { type: 'run.finished', runId: expect.any(String) },
    ]);
    const { values } = await graph.getState(config('t1'));
    expect(toChatHistory(values.messages).map((entry) => [entry.role, entry.text])).toEqual([
      ['user', 'How many orders?'],
      ['assistant', 'Done.'],
    ]);
    expect(models.lead.calls).toBe(2);
    expect(await hasUnfinishedRun(graph, 't1')).toBe(false);
  });

  it('picks a subagent up where it failed, without redoing its finished steps', async () => {
    const helperSaw: string[][] = [];
    const { graph, models, runs } = team(
      makeTree({}),
      (messages) => (messages.some((message) => message.getType() === 'tool') ? new AIMessage('Lead done.') : toolCall('task', { subagent_type: 'helper', description: 'List files' })),
      (messages, call) => {
        helperSaw.push(kinds(messages));
        if (!messages.some((message) => message.getType() === 'tool')) return toolCall('ls', { path: '/' }, `ls-${call}`);
        return call === 2 ? unavailable() : new AIMessage('Helper done.');
      },
    );

    await runs.start('t2', ask('What files are there?')).done;
    expect(runs.resumable()).toEqual(['t2']);
    await runs.resume('t2').done;

    // The third helper call already has its ls result: the subagent continued from its own checkpoint.
    expect(models.helper.calls).toBe(3);
    expect(helperSaw.at(-1)).toEqual(['system', 'human', 'ai', 'tool']);
    expect(models.lead.calls).toBe(2);
    const { values } = await graph.getState(config('t2'));
    expect(kinds(values.messages)).toEqual(['human', 'ai', 'tool', 'ai']);
  });

  it('continues a run the user stopped', async () => {
    let stop = () => {};
    const { graph, runs, runEvents } = team(makeTree({}), async (_messages, call) => {
      if (call > 1) return new AIMessage('Done after the stop.');
      stop();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new AIMessage('Too late.');
    });
    const { done } = runs.start('t3', ask('Hi'));
    stop = () => runs.cancel('t3');
    await done;
    expect(runEvents().at(-1)).toMatchObject({ type: 'run.failed', reason: 'stopped' });

    await runs.resume('t3').done;
    const { values } = await graph.getState(config('t3'));
    expect(toChatHistory(values.messages).map((entry) => entry.text)).toEqual(['Hi', 'Done after the stop.']);
  });

  it('continues after the step limit with a fresh budget', async () => {
    const lead: Script = (messages) =>
      messages.filter((message) => message.getType() === 'tool').length < 3 ? toolCall('ls', { path: '/' }, `ls-${messages.length}`) : new AIMessage('Finally.');
    const { graph } = team(makeTree({}), lead);
    const drain = async (input: unknown, recursionLimit: number) => {
      for await (const _chunk of await graph.stream(input, { ...config('t4'), recursionLimit })) {
        // Only the end state matters here.
      }
    };

    await expect(drain(ask('Loop'), 4)).rejects.toMatchObject({ name: 'GraphRecursionError' });
    expect(await hasUnfinishedRun(graph, 't4')).toBe(true);
    await drain(null, 200);
    const { values } = await graph.getState(config('t4'));
    expect(values.messages?.at(-1)?.content).toBe('Finally.');
  });

  it('after a restart, finds the run that was cut off but not finished or waiting ones', async () => {
    const dir = makeTree({});
    const before = team(
      dir,
      (messages) => {
        const asked = String(messages.findLast((message) => message.getType() === 'human')?.content ?? '');
        if (asked === 'cut') return unavailable();
        if (asked === 'approve') return toolCall('task', { subagent_type: 'helper', description: 'Write it' });
        return new AIMessage('Done.');
      },
      () => toolCall('write_file', { file_path: '/notes.md', content: 'x' }),
    );
    await before.runs.start('cut', ask('cut')).done;
    await before.runs.start('done', ask('done')).done;
    await before.runs.start('waiting', ask('approve')).done;
    expect(before.runs.pending('waiting')).toHaveLength(1);

    const after = team(dir, () => new AIMessage('Back.'));
    expect(await hasUnfinishedRun(after.graph, 'cut')).toBe(true);
    expect(await hasUnfinishedRun(after.graph, 'done')).toBe(false);
    expect(await hasUnfinishedRun(after.graph, 'waiting')).toBe(false);
    expect(await hasUnfinishedRun(after.graph, 'never-used')).toBe(false);
  });
});
