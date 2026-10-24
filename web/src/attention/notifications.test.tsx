import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { FakeNotification, resetPageVisibility, setPageHidden, stubNotification } from '../test-utils/fake-notification.ts';
import { baseRoutes, THREADS } from '../test-utils/fixtures.ts';

const visit = (path: string) => window.history.pushState({}, '', path);
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

const SQL_REQUEST = { tool: 'kbagent_sql', agent: 'keboola-developer', args: { sql: 'SELECT email FROM customers' }, decisions: ['approve', 'reject'] };

const ON = { ...baseRoutes, 'GET /api/settings': { language: 'ru', desktopNotifications: true } };

function startApp(routes: Record<string, unknown> = ON) {
  const stub = stubApi(routes);
  visit('/approvals');
  render(<App />);
  return stub;
}

const emit = (...args: Parameters<FakeEventSource['emit']>) => act(() => FakeEventSource.global().emit(...args));

beforeEach(() => {
  stubEventSource();
  stubNotification('granted');
});

afterEach(resetPageVisibility);

describe('desktop notifications', () => {
  it('tells a user away from the tab that an approval waits, without any data, and opens the chat on click', async () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    startApp();
    await screen.findByRole('heading', { name: 'Действия агентов ждут решения' });
    setPageHidden(true);

    emit({ type: 'approval.required', interruptId: 'i', requests: [SQL_REQUEST] }, 't1');
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    const [notification] = FakeNotification.instances;
    expect(notification?.title).toBe(THREADS[0]?.title);
    expect(notification?.options).toMatchObject({ body: 'keboola-developer ждёт вашего подтверждения', tag: 'chat:t1' });
    expect(JSON.stringify(notification?.options)).not.toMatch(/SELECT|customers|kbagent_sql/);

    act(() => notification?.click());
    expect(focus).toHaveBeenCalled();
    expect(notification?.closed).toBe(true);
    await waitFor(() => expect(window.location.pathname).toBe('/chat/t1'));
  });

  it('announces a finished chat, a finished routine run and a failure, one each', async () => {
    startApp({
      ...ON,
      'GET /api/routines': {
        routines: [{ name: 'morning', title: 'Morning', description: '', schedule: '0 8 * * *', timezone: 'UTC', enabled: true, lastRun: { at: '2026-10-24T08:00:00Z', threadId: 't2', running: false } }],
        loadErrors: [],
      },
    });
    await settle();
    setPageHidden(true);

    emit({ type: 'run.finished', runId: 'r1' }, 't1');
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    emit({ type: 'run.finished', runId: 'r2' }, 't2');
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(2));
    emit({ type: 'run.failed', runId: 'r3', error: 'token=abc123 rejected' }, 't1');
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(3));
    await settle();

    expect(FakeNotification.instances.map((entry) => [entry.title, entry.options.body, entry.options.tag])).toEqual([
      [THREADS[0]?.title, 'lead закончил, ответ готов', 'chat:t1'],
      [THREADS[1]?.title, 'lead выполнил регулярную задачу', 'chat:t2'],
      [THREADS[0]?.title, 'lead остановился с ошибкой', 'chat:t1'],
    ]);
    expect(JSON.stringify(FakeNotification.instances.map((entry) => entry.options))).not.toContain('abc123');
  });

  it('stays quiet while the tab is visible and clears its notifications when the user comes back', async () => {
    startApp();
    await settle();

    emit({ type: 'run.finished', runId: 'r1' }, 't1');
    await settle();
    expect(FakeNotification.instances).toHaveLength(0);

    setPageHidden(true);
    emit({ type: 'run.finished', runId: 'r2' }, 't1');
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    act(() => setPageHidden(false));
    expect(FakeNotification.instances[0]?.closed).toBe(true);
  });

  it('stays quiet when switched off in Settings or not allowed by the browser', async () => {
    startApp(baseRoutes);
    await settle();
    setPageHidden(true);
    emit({ type: 'approval.required', interruptId: 'i', requests: [SQL_REQUEST] }, 't1');
    await settle();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('stays quiet when the browser has not allowed notifications', async () => {
    stubNotification('denied');
    startApp();
    await settle();
    setPageHidden(true);
    emit({ type: 'run.finished', runId: 'r' }, 't1');
    await settle();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('still names the agent and the app when the chat list cannot be read', async () => {
    startApp({ ...ON, 'GET /api/threads': () => new Response('{}', { status: 500 }) });
    await settle();
    setPageHidden(true);
    emit({ type: 'approval.required', interruptId: 'i', requests: [{ ...SQL_REQUEST, agent: undefined }] }, 't9');
    await waitFor(() => expect(FakeNotification.instances).toHaveLength(1));
    expect(FakeNotification.instances[0]).toMatchObject({ title: 'Agent Studio', options: { body: 'lead ждёт вашего подтверждения', tag: 'chat:t9' } });
  });
});
