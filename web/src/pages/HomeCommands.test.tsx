import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

const NEW_THREAD = { id: 't9', title: 'Опиши проект', createdAt: '2026-10-24T10:00:00Z', updatedAt: '2026-10-24T10:00:00Z' };

async function openHome(routes: Record<string, unknown> = {}) {
  const api = stubApi({
    ...baseRoutes,
    'GET /api/threads/t9/messages': [],
    'GET /api/threads/t9/policy': { allowSql: false },
    ...routes,
  });
  window.history.pushState({}, '', '/');
  render(<App />);
  await screen.findByRole('button', { name: 'Чаты' });
  await waitFor(() => expect(api.callsTo('GET', '/api/team').length).toBeGreaterThan(0));
  return api;
}

const ask = () => screen.getByRole('textbox', { name: 'Спросить команду' });
const names = () =>
  within(screen.getByRole('listbox', { name: 'Команды' }))
    .getAllByRole('option')
    .map((option) => option.querySelector('.command-menu__name')?.textContent);

beforeEach(() => {
  stubEventSource();
});

describe('Commands in the Home composer', () => {
  it('offers the commands that make sense without an open chat', async () => {
    await openHome();
    await userEvent.type(ask(), '/');
    expect(names()).toEqual(['/skill <навык>', '/agent <агент>', '/plan', '/init', '/help']);
  });

  it('starts a chat with a skill and opens it in the popup', async () => {
    const api = await openHome({ 'POST /api/threads': { thread: NEW_THREAD, runId: 'r1' } });
    await userEvent.type(ask(), '/sk{Enter}');
    await userEvent.keyboard('{Enter}');
    expect(ask()).toHaveValue('/skill kbagent ');
    await userEvent.type(ask(), 'Опиши проект{Enter}');

    await waitFor(() => expect(api.callsTo('POST', '/api/threads')[0]?.body).toEqual({ text: 'Опиши проект', command: { name: 'skill', arg: 'kbagent' } }));
    expect(await screen.findByRole('dialog', { name: 'Чат' })).toBeInTheDocument();
    await waitFor(() => expect(ask()).toHaveValue(''));
  });

  it('starts the init workspace for /init and opens its chat in the popup', async () => {
    const api = await openHome({
      'GET /api/onboarding': { project: 'sandbox', profiled: true, running: false },
      'POST /api/onboarding/start': { threadId: 't9' },
    });
    await userEvent.type(ask(), '/init{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Чат' })).toBeInTheDocument();
    expect(api.callsTo('POST', '/api/onboarding/start')[0]?.body).toEqual({ text: expect.stringContaining('sandbox') });
  });

  it('explains that /init needs a connected project', async () => {
    await openHome({ 'GET /api/onboarding': { project: '', profiled: false, running: false } });
    await userEvent.type(ask(), '/init{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Проект Keboola ещё не подключён');
  });

  it('keeps the text when the chat could not be started', async () => {
    await openHome({ 'POST /api/threads': () => new Response(JSON.stringify({ error: 'No skill "kbagent" in this team' }), { status: 400 }) });
    await userEvent.type(ask(), '/skill kbagent Опиши проект');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('No skill "kbagent" in this team')).toBeInTheDocument();
    expect(ask()).toHaveValue('/skill kbagent Опиши проект');
  });
});
