import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import type { ChatEntry } from '../api/types.ts';
import type { ServerRun } from '../state/run-state.ts';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

const QUESTION = 'Где используется customer_id?';

async function openChat(routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...routes });
  window.history.pushState({}, '', '/chat/t1');
  render(<App />);
  await screen.findByText(QUESTION, { selector: '.message__plain' });
  return { ...api, source: FakeEventSource.forThread('t1') };
}

/** The stream drops and comes back, e.g. across a server restart. */
const reconnect = (source: FakeEventSource) =>
  act(() => {
    source.fail();
    source.open();
  });

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  stubEventSource();
});

describe('a chat in step with the server', () => {
  it('offers to continue a run a server restart cut off, instead of looking busy forever', async () => {
    let server: ServerRun = { status: 'running', resumable: false };
    const { source } = await openChat({ 'GET /api/threads/t1/run': () => server });
    act(() => {
      source.emit({ type: 'run.started', runId: 'r1' });
      source.emit({ type: 'tool.start', agent: 'keboola-expert', callId: 'c1', tool: 'kbagent_read', args: { purpose: 'List buckets' } });
    });
    expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument();

    server = { status: 'idle', resumable: true };
    reconnect(source);
    expect(await screen.findByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Стоп' })).toBeNull();
    expect(screen.queryByText('Команда работает')).toBeNull();
  });

  it('shows a run that started before the events it replays (reload mid-run)', async () => {
    const { source } = await openChat({ 'GET /api/threads/t1/run': { status: 'running', resumable: false } });
    act(() => source.emit({ type: 'tool.start', agent: 'keboola-expert', callId: 'c1', tool: 'kbagent_read', args: { purpose: 'List buckets' } }));
    expect(await screen.findByRole('button', { name: 'Стоп' })).toBeInTheDocument();
  });

  it('frees the composer when the approval it waited for is gone after a restart', async () => {
    let pending: unknown[] = [{ interruptId: 'i1', requests: [{ tool: 'kbagent_sql', args: { sql: 'select 1' }, decisions: ['approve', 'reject'] }] }];
    let server: ServerRun = { status: 'waiting', resumable: false };
    const { source } = await openChat({
      'GET /api/threads/t1/approvals': () => pending,
      'GET /api/threads/t1/run': () => server,
      'POST /api/threads/t1/approvals': () => errorResponse(409, 'No pending approvals for this thread'),
    });
    act(() => {
      source.emit({ type: 'run.started', runId: 'r' });
      source.emit({ type: 'approval.required', interruptId: 'i1', requests: [{ tool: 'kbagent_sql', args: { sql: 'select 1' }, decisions: ['approve', 'reject'] }] });
      source.emit({ type: 'run.waiting', runId: 'r' });
    });
    const approve = await screen.findByRole('button', { name: 'Разрешить' });

    pending = [];
    server = { status: 'idle', resumable: true };
    await userEvent.click(approve);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull());
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('puts the steps of a turn another tab started under its own message', async () => {
    const before: ChatEntry[] = [
      { id: 'h1', role: 'user', text: QUESTION },
      { id: 'a1', role: 'assistant', text: 'В **двух** трансформациях.' },
    ];
    let history = before;
    const { source } = await openChat({ 'GET /api/threads/t1/messages': () => history });
    act(() => {
      source.emit({ type: 'run.started', runId: 'r0' });
      source.emit({ type: 'delegate.start', agent: 'lead', callId: 'd0', to: 'keboola-expert', task: 'OLD TASK' });
      source.emit({ type: 'delegate.end', agent: 'lead', callId: 'd0', to: 'keboola-expert', ok: true });
      source.emit({ type: 'run.finished', runId: 'r0' });
    });

    history = [...before, { id: 'h2', role: 'user', text: 'А в каких джобах?' }];
    act(() => {
      source.emit({ type: 'run.started', runId: 'r1' });
      source.emit({ type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'NEW TASK' });
    });
    const followUp = await screen.findByText('А в каких джобах?', { selector: '.message__plain' });
    const reply = screen.getByText('двух');
    expect(follows(screen.getByText('OLD TASK'), reply)).toBe(true);
    expect(follows(followUp, screen.getByText('NEW TASK'))).toBe(true);
  });

  it('keeps a message the user sent until the server history has it', async () => {
    let history: ChatEntry[] = [{ id: 'h1', role: 'user', text: QUESTION }];
    const { source } = await openChat({ 'GET /api/threads/t1/messages': () => history, 'POST /api/threads/t1/messages': { runId: 'r1' } });
    await userEvent.type(screen.getByRole('textbox'), 'Ещё вопрос{Enter}');
    // The run starts before the server saved the message: the history fetch does not have it yet.
    act(() => source.emit({ type: 'run.started', runId: 'r1' }));
    await waitFor(() => expect(screen.getAllByText('Ещё вопрос', { selector: '.message__plain' })).toHaveLength(1));
    history = [...history, { id: 'h2', role: 'user', text: 'Ещё вопрос' }];
    act(() => source.emit({ type: 'run.finished', runId: 'r1' }));
    await waitFor(() => expect(screen.getAllByText('Ещё вопрос', { selector: '.message__plain' })).toHaveLength(1));
  });

  it('does not send on Enter while the team works, and keeps the text', async () => {
    const { source, callsTo } = await openChat({ 'POST /api/threads/t1/messages': { runId: 'r2' } });
    act(() => source.emit({ type: 'run.started', runId: 'r1' }));
    await userEvent.type(screen.getByRole('textbox'), 'important follow-up{Enter}');
    expect(callsTo('POST', '/api/threads/t1/messages')).toHaveLength(0);
    expect(screen.getByRole('textbox')).toHaveValue('important follow-up');
  });
});
