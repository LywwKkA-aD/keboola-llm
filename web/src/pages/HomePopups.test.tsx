import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes, THREADS } from '../test-utils/fixtures.ts';

const APPROVAL = {
  threadId: 't1',
  threadTitle: 'Где используется customer_id?',
  interruptId: 'i1',
  requests: [{ tool: 'kbagent_write', agent: 'keboola-expert', args: { args: ['branch', 'create', '--name', 'fix'], purpose: 'Dev branch' }, decisions: ['approve', 'reject'] }],
};

const NEW_THREAD = { id: 't9', title: 'Сколько таблиц?', createdAt: '2026-10-24T10:00:00Z', updatedAt: '2026-10-24T10:00:00Z' };

async function openHome(routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...routes });
  window.history.pushState({}, '', '/');
  render(<App />);
  await screen.findByRole('button', { name: 'Чаты' });
  return api;
}

async function openPanel(button: string | RegExp, name: string) {
  await userEvent.click(screen.getByRole('button', { name: button }));
  return screen.getByRole('dialog', { name });
}

const chatPopup = () => screen.getByRole('dialog', { name: 'Чат' });

beforeEach(() => {
  stubEventSource();
});

describe('Home popups', () => {
  it('lists running and recent chats and opens one in the chat popup over the aquarium', async () => {
    await openHome();
    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't1'));
    const chats = await openPanel('Чаты', 'Чаты');

    const running = within(chats).getByRole('region', { name: 'Идут сейчас' });
    expect(await within(running).findByRole('button', { name: 'Где используется customer_id?' })).toBeInTheDocument();
    const recent = within(chats).getByRole('region', { name: 'Недавние чаты' });
    expect(within(recent).getByRole('button', { name: /Почему упал джоб\?/ })).toBeInTheDocument();
    expect(within(chats).getByRole('link', { name: 'Все чаты' })).toHaveAttribute('href', '/chat');

    await userEvent.click(within(recent).getByRole('button', { name: /Почему упал джоб\?/ }));
    expect(screen.queryByRole('dialog', { name: 'Чаты' })).toBeNull();
    const popup = chatPopup();
    expect(await within(popup).findByRole('heading', { name: 'Почему упал джоб?' })).toBeInTheDocument();
    expect(within(popup).getByRole('link', { name: 'Открыть в чатах' })).toHaveAttribute('href', '/chat/t2');
    expect(window.location.pathname).toBe('/');
    expect(screen.getByTestId('aquarium-view')).toBeInTheDocument();
    expect(FakeEventSource.forThread('t2').url).toBe('/api/events?threadId=t2');

    await userEvent.click(within(popup).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Чат' })).toBeNull();
  });

  it('answers approvals from the approvals panel and opens their chat', async () => {
    const { callsTo } = await openHome({ 'GET /api/approvals': [APPROVAL], 'POST /api/threads/t1/approvals': { runId: 'r2' } });
    await screen.findByRole('button', { name: 'Подтверждения 1' });
    const panel = await openPanel('Подтверждения 1', 'Подтверждения');

    expect(within(panel).getByText('kbagent branch create --name fix')).toBeInTheDocument();
    expect(within(panel).getByText('Dev branch')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Все подтверждения' })).toHaveAttribute('href', '/approvals');

    await userEvent.click(within(panel).getByRole('button', { name: 'Разрешить' }));
    expect(callsTo('POST', '/api/threads/t1/approvals')[0]?.body).toEqual({
      answers: [{ interruptId: 'i1', decisions: [{ type: 'approve' }] }],
    });
    await waitFor(() => expect(callsTo('GET', '/api/approvals').length).toBeGreaterThan(1));

    await userEvent.click(within(panel).getByRole('button', { name: 'Где используется customer_id?' }));
    expect(await within(chatPopup()).findByText('двух')).toBeInTheDocument();
  });

  it('says when there is nothing to approve', async () => {
    await openHome();
    const panel = await openPanel(/^Подтверждения/, 'Подтверждения');
    expect(within(panel).getByText('Подтверждать нечего.')).toBeInTheDocument();
  });

  it('asks the team and opens the new chat in the popup, where approvals work as in the chat', async () => {
    const { callsTo } = await openHome({
      'POST /api/threads': { thread: NEW_THREAD, runId: 'r' },
      'GET /api/threads': [NEW_THREAD, ...THREADS],
      'GET /api/threads/t9/messages': [{ id: 'u', role: 'user', text: 'Сколько таблиц?' }],
      'GET /api/threads/t9/policy': { allowSql: false },
      'POST /api/threads/t9/approvals': { runId: 'r2' },
    });
    const input = screen.getByRole('textbox', { name: 'Спросить команду' });
    await userEvent.type(input, 'Сколько таблиц?{Enter}');
    expect(callsTo('POST', '/api/threads')[0]?.body).toEqual({ text: 'Сколько таблиц?' });

    const popup = await screen.findByRole('dialog', { name: 'Чат' });
    expect(input).toHaveValue('');
    expect(window.location.pathname).toBe('/');
    expect(await within(popup).findByRole('heading', { name: 'Сколько таблиц?' })).toBeInTheDocument();
    expect(within(popup).getByRole('link', { name: 'Открыть в чатах' })).toHaveAttribute('href', '/chat/t9');

    const stream = FakeEventSource.forThread('t9');
    act(() => {
      stream.emit({ type: 'run.started', runId: 'r' });
      stream.emit({ type: 'token', agent: 'lead', text: 'Считаю...' });
    });
    expect(within(popup).getByText('Считаю...')).toBeInTheDocument();

    act(() => {
      stream.emit({
        type: 'approval.required',
        interruptId: 'i9',
        requests: [{ tool: 'write_file', args: { file_path: '/agents/x/AGENT.md', content: 'name: x' }, decisions: ['approve', 'reject'] }],
      });
      stream.emit({ type: 'run.waiting', runId: 'r' });
    });
    await userEvent.click(within(popup).getByRole('button', { name: 'Разрешить' }));
    expect(callsTo('POST', '/api/threads/t9/approvals')[0]?.body).toEqual({
      answers: [{ interruptId: 'i9', decisions: [{ type: 'approve' }] }],
    });

    // Escape closes the popup and gives focus back to where the question was asked.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Чат' })).toBeNull();
    expect(input).toHaveFocus();
  });

  it('reports a failure to start a chat', async () => {
    await openHome({ 'POST /api/threads': () => errorResponse(500, 'Internal error') });
    await userEvent.type(screen.getByRole('textbox', { name: 'Спросить команду' }), 'x{Enter}');
    expect(await screen.findByText('Internal error')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Чат' })).toBeNull();
  });
});
