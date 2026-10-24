import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes, THREADS } from '../test-utils/fixtures.ts';

async function openChat(routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, 'POST /api/threads/t1/resume': { runId: 'r2' }, ...routes });
  window.history.pushState({}, '', '/chat/t1');
  render(<App />);
  await screen.findByText('Где используется customer_id?', { selector: '.message__plain' });
  return { ...api, source: FakeEventSource.forThread('t1') };
}

const header = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement;
const chatLink = (title: string) => screen.getByRole('link', { name: title }).closest('li') as HTMLElement;

beforeEach(() => {
  stubEventSource();
});

describe('continuing a chat', () => {
  it('explains a model failure and continues the run in the same turn', async () => {
    const { source, callsTo } = await openChat();
    act(() => {
      source.emit({ type: 'run.started', runId: 'r1' });
      source.emit({ type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Find customer_id usages' });
      source.emit({ type: 'run.failed', runId: 'r1', reason: 'model_unavailable', error: '503 upstream overloaded' });
    });

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Модель не ответила: она перегружена или недоступна.');
    expect(notice).toHaveTextContent('503 upstream overloaded');
    // The step the failure cut short no longer looks busy.
    expect(screen.queryByText('Идёт')).toBeNull();

    await userEvent.click(within(notice).getByRole('button', { name: 'Продолжить' }));
    expect(callsTo('POST', '/api/threads/t1/resume')).toHaveLength(1);

    act(() => {
      source.emit({ type: 'run.started', runId: 'r2', resume: true });
      source.emit({ type: 'delegate.end', agent: 'lead', callId: 'd1', to: 'keboola-expert', ok: true });
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Команда работает')).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Шаги' })).toHaveLength(1);
  });

  it('says so when the user stopped the run', async () => {
    const { source } = await openChat();
    act(() => source.emit({ type: 'run.failed', runId: 'r1', reason: 'stopped', error: 'Stopped by the user' }));
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Остановлено. Команда может продолжить с того же места.');
    expect(notice).not.toHaveTextContent('Stopped by the user');
    expect(within(notice).getByRole('button', { name: 'Продолжить' })).toBeEnabled();
  });

  it('shows a chat a restart cut off as interrupted and continues it', async () => {
    const threads = [{ ...THREADS[0], resumable: true }, THREADS[1]];
    const { source, callsTo } = await openChat({ 'GET /api/threads': () => threads });

    await waitFor(() => expect(within(header()).getByText('Прервано')).toBeInTheDocument());
    expect(within(chatLink('Где используется customer_id?')).getByText('Прервано')).toBeInTheDocument();
    expect(within(chatLink('Почему упал джоб?')).queryByText('Прервано')).toBeNull();
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Команда остановилась, не закончив ответ, например из-за перезапуска приложения.');

    threads[0] = THREADS[0] as (typeof threads)[0];
    await userEvent.click(within(notice).getByRole('button', { name: 'Продолжить' }));
    expect(callsTo('POST', '/api/threads/t1/resume')).toHaveLength(1);
    act(() => source.emit({ type: 'run.started', runId: 'r2', resume: true }));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(within(chatLink('Где используется customer_id?')).queryByText('Прервано')).toBeNull());
  });

  it('shows why the server would not continue', async () => {
    const { source } = await openChat({ 'POST /api/threads/t1/resume': () => errorResponse(409, 'Nothing to continue in this chat') });
    act(() => source.emit({ type: 'run.failed', runId: 'r1', reason: 'error', error: 'kbagent exited with code 2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('kbagent exited with code 2');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText('Nothing to continue in this chat')).toBeInTheDocument();
  });
});
