import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

const visit = (path: string) => window.history.pushState({}, '', path);

async function openChat(routes: Record<string, unknown> = {}, path = '/chat/t1') {
  const api = stubApi({ ...baseRoutes, ...routes });
  visit(path);
  render(<App />);
  await screen.findByText('Где используется customer_id?', { selector: '.message__plain' });
  return { ...api, source: FakeEventSource.latest() };
}

beforeEach(() => {
  stubEventSource();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Chat page', () => {
  it('shows the chat list and history, and subscribes to that chat only', async () => {
    const { source } = await openChat();

    expect(screen.getByRole('link', { name: 'Почему упал джоб?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Где используется customer_id?' })).toHaveClass('threads__link--active');
    expect(screen.getByText('двух').tagName).toBe('STRONG');
    expect(source.url).toBe('/api/events?threadId=t1');
  });

  it('streams the lead agent reply live and reloads history when the run ends', async () => {
    const { source, callsTo } = await openChat();
    const historyLoads = () => callsTo('GET', '/api/threads/t1/messages').length;
    const before = historyLoads();

    act(() => {
      source.emit({ type: 'run.started', runId: 'r1' });
      source.emit({ type: 'token', agent: 'lead', text: 'Сейчас ' });
      source.emit({ type: 'token', agent: 'keboola-expert', text: 'internal notes' });
      source.emit({ type: 'token', agent: 'lead', text: 'проверю.' });
      source.emit({ type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Find customer_id usages' });
    });

    expect(screen.getByText('Сейчас проверю.')).toBeInTheDocument();
    expect(screen.queryByText(/internal notes/)).toBeNull();
    expect(screen.getByText('Команда работает')).toBeInTheDocument();
    expect(screen.getByText('Find customer_id usages')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument();

    act(() => source.emit({ type: 'run.finished', runId: 'r1' }));
    await waitFor(() => expect(historyLoads()).toBeGreaterThan(before));
    expect(screen.queryByText('Команда работает')).toBeNull();
  });

  it('asks for approval and sends the decision', async () => {
    const { source, callsTo } = await openChat({ 'POST /api/threads/t1/approvals': { runId: 'r2' } });

    act(() => {
      source.emit({ type: 'run.started', runId: 'r1' });
      source.emit({
        type: 'approval.required',
        interruptId: 'i1',
        requests: [{ tool: 'write_file', args: { file_path: '/agents/x/AGENT.md', content: 'name: x' }, decisions: ['approve', 'reject'] }],
      });
      source.emit({ type: 'run.waiting', runId: 'r1' });
    });

    expect(screen.getByText('Ждём вашего подтверждения')).toBeInTheDocument();
    expect(screen.getByText('/agents/x/AGENT.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Разрешить' }));
    expect(callsTo('POST', '/api/threads/t1/approvals')[0]?.body).toEqual({
      answers: [{ interruptId: 'i1', decisions: [{ type: 'approve' }] }],
    });

    act(() => source.emit({ type: 'run.started', runId: 'r2' }));
    expect(screen.queryByText('/agents/x/AGENT.md')).toBeNull();
  });

  it('sends a message and shows it right away', async () => {
    const { callsTo } = await openChat({ 'POST /api/threads/t1/messages': { runId: 'r3' } });

    await userEvent.type(screen.getByRole('textbox'), 'А в каких джобах?{Enter}');

    expect(screen.getByText('А в каких джобах?')).toBeInTheDocument();
    expect(callsTo('POST', '/api/threads/t1/messages')[0]?.body).toEqual({ text: 'А в каких джобах?' });
  });

  it('shows API errors, e.g. a busy chat', async () => {
    await openChat({ 'POST /api/threads/t1/messages': () => errorResponse(409, 'Thread is busy with another run') });
    await userEvent.type(screen.getByRole('textbox'), 'x{Enter}');
    expect(await screen.findByText('Thread is busy with another run')).toBeInTheDocument();
  });

  it('shows why a run failed', async () => {
    const { source } = await openChat();
    act(() => source.emit({ type: 'run.failed', runId: 'r1', error: 'model down' }));
    expect(screen.getByText(/Ошибка выполнения: model down/)).toBeInTheDocument();
  });

  it('stops a running chat', async () => {
    const { source, callsTo } = await openChat({ 'POST /api/threads/t1/cancel': { cancelled: true } });
    act(() => source.emit({ type: 'run.started', runId: 'r1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Стоп' }));
    expect(callsTo('POST', '/api/threads/t1/cancel')).toHaveLength(1);
  });

  it('toggles SQL for this chat', async () => {
    const { callsTo } = await openChat({ 'PUT /api/threads/t1/policy': (body: unknown) => body });
    const toggle = screen.getByRole('checkbox', { name: 'Разрешить SQL в этом чате' });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    expect(callsTo('PUT', '/api/threads/t1/policy')[0]?.body).toEqual({ allowSql: true });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('loads a chat that already allows SQL', async () => {
    await openChat({ 'GET /api/threads/t1/policy': { allowSql: true } });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  });

  it('starts a new chat from the first message and opens it', async () => {
    const created = { id: 't9', title: 'Новый вопрос', createdAt: '', updatedAt: '' };
    const { callsTo } = stubApi({
      ...baseRoutes,
      'POST /api/threads': { thread: created, runId: 'r1' },
      'GET /api/threads/t9/messages': [{ id: 'u', role: 'user', text: 'Новый вопрос' }],
      'GET /api/threads/t9/policy': { allowSql: false },
    });
    visit('/chat');
    render(<App />);

    await userEvent.type(await screen.findByRole('textbox'), 'Новый вопрос{Enter}');

    expect(callsTo('POST', '/api/threads')[0]?.body).toEqual({ text: 'Новый вопрос' });
    await waitFor(() => expect(window.location.pathname).toBe('/chat/t9'));
    expect(FakeEventSource.latest().url).toBe('/api/events?threadId=t9');
  });

  it('reports a failure to start a chat', async () => {
    stubApi({ ...baseRoutes, 'POST /api/threads': () => errorResponse(500, 'Internal error') });
    visit('/chat');
    render(<App />);
    await userEvent.type(await screen.findByRole('textbox'), 'x{Enter}');
    expect(await screen.findByText('Internal error')).toBeInTheDocument();
  });

  it('deletes the open chat and returns to a new one', async () => {
    const { callsTo } = await openChat({ 'DELETE /api/threads/t1': undefined });
    const [deleteFirst] = screen.getAllByRole('button', { name: 'Удалить чат' });

    await userEvent.click(deleteFirst as HTMLElement);

    expect(callsTo('DELETE', '/api/threads/t1')).toHaveLength(1);
    await waitFor(() => expect(window.location.pathname).toBe('/chat'));
  });

  it('closes the old event stream when switching chats', async () => {
    const { source } = await openChat();
    await userEvent.click(screen.getByRole('link', { name: 'Почему упал джоб?' }));

    await waitFor(() => expect(FakeEventSource.latest().url).toBe('/api/events?threadId=t2'));
    expect(source.closed).toBe(true);
  });
});
