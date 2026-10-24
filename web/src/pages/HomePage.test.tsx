import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

const APPROVAL = {
  threadId: 't1',
  threadTitle: 'Где используется customer_id?',
  interruptId: 'i1',
  requests: [{ tool: 'kbagent_write', agent: 'keboola-expert', args: { args: ['branch', 'create', '--name', 'fix'], purpose: 'Dev branch' }, decisions: ['approve', 'reject'] }],
};

async function openHome(routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...routes });
  window.history.pushState({}, '', '/');
  render(<App />);
  await screen.findByRole('button', { name: /keboola-expert/ });
  return api;
}

const team = () => screen.getByRole('navigation', { name: 'Команда' });

beforeEach(() => {
  stubEventSource();
});

describe('Home page', () => {
  it('offers to survey a project the team does not know yet, once, and hides the offer when it is done', async () => {
    let status: Record<string, unknown> = { project: 'sandbox', profiled: false, running: false };
    const api = await openHome({
      'GET /api/onboarding': () => status,
      'POST /api/onboarding/start': () => {
        status = { ...status, threadId: 't9', running: true };
        return { threadId: 't9' };
      },
    });
    const card = await screen.findByRole('region', { name: 'Инициализация проекта' });
    expect(card).toHaveTextContent('sandbox');

    await userEvent.click(within(card).getByRole('button', { name: 'Запустить инициализацию' }));
    expect(api.callsTo('POST', '/api/onboarding/start')[0]?.body).toEqual({ text: expect.stringContaining('sandbox') });
    expect(await within(card).findByRole('link', { name: 'Открыть чат' })).toHaveAttribute('href', '/chat/t9');
    expect(within(card).queryByRole('button', { name: 'Запустить инициализацию' })).toBeNull();

    // The profile is written early; the card stays until the whole init is over.
    status = { project: 'sandbox', profiled: true, running: true, threadId: 't9', updatedAt: '2026-10-24T10:00:00Z' };
    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't9'));
    await waitFor(() => expect(api.callsTo('GET', '/api/onboarding').length).toBeGreaterThanOrEqual(2));
    await act(async () => {});
    expect(within(card).getByRole('link', { name: 'Открыть чат' })).toBeInTheDocument();
    status = { project: 'sandbox', profiled: true, running: false, updatedAt: '2026-10-24T10:00:00Z' };
    act(() => FakeEventSource.global().emit({ type: 'run.finished', runId: 'r' }, 't9'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Инициализация проекта' })).toBeNull());
  });

  it('offers no survey without a Keboola project or once the project is profiled', async () => {
    await openHome({ 'GET /api/onboarding': { project: '', profiled: false, running: false } });
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Инициализация проекта' })).toBeNull();
  });

  it('shows the team by group next to the aquarium and an overview', async () => {
    await openHome();
    expect(within(team()).getByText('Лид')).toBeInTheDocument();
    expect(within(team()).getByText('Специалисты Keboola')).toBeInTheDocument();
    expect(within(team()).getByText('Выключены')).toBeInTheDocument();
    expect(screen.getByTestId('aquarium-view')).toBeInTheDocument();
    expect(screen.getByText('Сейчас ничего не выполняется.')).toBeInTheDocument();
    expect(screen.getByText('Подтверждать нечего.')).toBeInTheDocument();
  });

  it('follows live events from every chat', async () => {
    await openHome();
    const stream = FakeEventSource.global();
    act(() => {
      stream.emit({ type: 'run.started', runId: 'r' }, 't1');
      stream.emit({ type: 'tool.start', agent: 'keboola-expert', callId: 'c', tool: 'kbagent_read', args: { purpose: 'List buckets' } }, 't1');
      stream.emit({ type: 'usage', agent: 'keboola-expert', input: 12_000, output: 300, cached: 11_000 }, 't1');
    });

    expect(within(team()).getByText('работает в Keboola · List buckets')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List buckets' })).toHaveAttribute('href', '/chat/t1');
    expect(await screen.findByRole('link', { name: 'Где используется customer_id?' })).toHaveAttribute('href', '/chat/t1');
    expect(screen.getByText('11.0k')).toBeInTheDocument();
  });

  it('opens an agent and goes back to the overview', async () => {
    await openHome();
    await userEvent.click(within(team()).getByRole('button', { name: /keboola-expert/ }));

    expect(screen.getByRole('heading', { name: 'keboola-expert' })).toBeInTheDocument();
    expect(screen.getByText('Answers Keboola questions.')).toBeInTheDocument();
    expect(screen.getAllByText('kbagent', { selector: 'dd' })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('heading', { name: 'keboola-expert' })).toBeNull();
  });

  it('answers approvals right from the overview', async () => {
    const { callsTo } = await openHome({ 'GET /api/approvals': [APPROVAL], 'POST /api/threads/t1/approvals': { runId: 'r2' } });
    expect(await screen.findByText('kbagent branch create --name fix')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Разрешить' }));
    expect(callsTo('POST', '/api/threads/t1/approvals')[0]?.body).toEqual({
      answers: [{ interruptId: 'i1', decisions: [{ type: 'approve' }] }],
    });
    await waitFor(() => expect(callsTo('GET', '/api/approvals').length).toBeGreaterThan(1));
  });

  it('asks the team and streams the reply in place', async () => {
    const { callsTo } = await openHome({
      'POST /api/threads': { thread: { id: 't9', title: 'Q', createdAt: '', updatedAt: '' }, runId: 'r' },
      'GET /api/threads/t9/messages': [
        { id: 'u', role: 'user', text: 'Сколько таблиц?' },
        { id: 'a', role: 'assistant', text: 'Четыре таблицы.' },
      ],
    });

    await userEvent.type(screen.getByRole('textbox', { name: 'Спросить команду' }), 'Сколько таблиц?{Enter}');
    expect(callsTo('POST', '/api/threads')[0]?.body).toEqual({ text: 'Сколько таблиц?' });
    await waitFor(() => expect(() => FakeEventSource.forThread('t9')).not.toThrow());

    act(() => {
      FakeEventSource.forThread('t9').emit({ type: 'run.started', runId: 'r' });
      FakeEventSource.forThread('t9').emit({ type: 'token', agent: 'lead', text: 'Считаю...' });
    });
    expect(screen.getByText('Считаю...')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть чат' })).toHaveAttribute('href', '/chat/t9');

    act(() => FakeEventSource.forThread('t9').emit({ type: 'run.finished', runId: 'r' }));
    expect(await screen.findByText('Четыре таблицы.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }));
    expect(screen.queryByText('Четыре таблицы.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Показать ответ' }));
    expect(screen.getByText('Четыре таблицы.')).toBeInTheDocument();
  });

  it('reports a failure to start a chat', async () => {
    await openHome({ 'POST /api/threads': () => errorResponse(500, 'Internal error') });
    await userEvent.type(screen.getByRole('textbox', { name: 'Спросить команду' }), 'x{Enter}');
    expect(await screen.findByText('Internal error')).toBeInTheDocument();
  });
});
