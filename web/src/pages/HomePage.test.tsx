import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';
import { SETUP_COMPLETE, setupReport } from '../test-utils/setup-fixtures.ts';

const APPROVAL = {
  threadId: 't1',
  threadTitle: 'Где используется customer_id?',
  interruptId: 'i1',
  requests: [{ tool: 'kbagent_write', agent: 'keboola-expert', args: { args: ['branch', 'create', '--name', 'fix'], purpose: 'Dev branch' }, decisions: ['approve', 'reject'] }],
};

const PHONE = '(max-width: 640px)';

async function openHome(routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...routes });
  window.history.pushState({}, '', '/');
  render(<App />);
  await screen.findByRole('button', { name: 'Команда' });
  return api;
}

const hud = () => screen.getByRole('region', { name: 'Обзор' });
const stat = (label: string) => within(hud()).getByText(label).closest('.hud-stat');

async function openTeam() {
  await userEvent.click(screen.getByRole('button', { name: 'Команда' }));
  const team = screen.getByRole('dialog', { name: 'Команда' });
  await within(team).findByRole('button', { name: /keboola-expert/ });
  return team;
}

beforeEach(() => {
  stubEventSource();
});

describe('Home page', () => {
  it('is the aquarium edge to edge with a slim HUD instead of side panels', async () => {
    await openHome();
    expect(screen.getByTestId('aquarium-view')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Команда' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    expect(stat('Работают')).toHaveTextContent('0');
    expect(stat('Ждут')).toHaveTextContent('0');
    expect(stat('Токены')).toHaveTextContent('0');
    for (const name of ['Команда', 'Чаты']) {
      expect(within(hud()).getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(within(hud()).getByRole('button', { name: /^Подтверждения/ })).not.toHaveClass('hud__btn--amber');
    expect(screen.getByRole('textbox', { name: 'Спросить команду' })).toBeInTheDocument();
  });

  it('opens one panel at a time; Escape and the close button close it and give focus back', async () => {
    await openHome();
    const teamButton = screen.getByRole('button', { name: 'Команда' });
    const chatsButton = screen.getByRole('button', { name: 'Чаты' });

    await userEvent.click(teamButton);
    const team = screen.getByRole('dialog', { name: 'Команда' });
    expect(teamButton).toHaveAttribute('aria-expanded', 'true');
    expect(teamButton).toHaveAttribute('aria-controls', team.id);
    expect(team).toHaveFocus();

    await userEvent.click(chatsButton);
    expect(screen.getByRole('dialog', { name: 'Чаты' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Команда' })).toBeNull();
    expect(teamButton).toHaveAttribute('aria-expanded', 'false');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chatsButton).toHaveFocus();

    await userEvent.click(teamButton);
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Команда' })).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(teamButton).toHaveFocus();
  });

  it('shows the team by group with live moods and opens an agent in a card', async () => {
    await openHome();
    const team = await openTeam();
    expect(within(team).getByText('Лид')).toBeInTheDocument();
    expect(within(team).getByText('Специалисты Keboola')).toBeInTheDocument();
    expect(within(team).getByText('Выключены')).toBeInTheDocument();

    act(() => {
      FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't1');
      FakeEventSource.global().emit({ type: 'tool.start', agent: 'keboola-expert', callId: 'c', tool: 'kbagent_read', args: { purpose: 'List buckets' } }, 't1');
    });
    expect(within(team).getByText('работает в Keboola · List buckets')).toBeInTheDocument();

    const row = within(team).getByRole('button', { name: /keboola-expert/ });
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
    const card = screen.getByRole('complementary', { name: 'keboola-expert' });
    expect(within(card).getByRole('heading', { name: 'keboola-expert' })).toBeInTheDocument();
    expect(within(card).getByText('Answers Keboola questions.')).toBeInTheDocument();
    expect(within(card).getAllByText('kbagent', { selector: 'dd' })).toHaveLength(2);

    // Escape closes the topmost layer first: the panel, then the card.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Команда' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'keboola-expert' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'keboola-expert' })).toBeNull();

    await userEvent.click(within(await openTeam()).getByRole('button', { name: /keboola-expert/ }));
    await userEvent.click(within(screen.getByRole('complementary', { name: 'keboola-expert' })).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('complementary', { name: 'keboola-expert' })).toBeNull();
  });

  it('counts runs, approvals and tokens of this session in the HUD', async () => {
    await openHome({ 'GET /api/approvals': [APPROVAL] });
    const approvals = await within(hud()).findByRole('button', { name: 'Подтверждения 1' });
    expect(approvals).toHaveClass('hud__btn--amber');
    expect(stat('Ждут')).toHaveTextContent('1');

    act(() => {
      FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't1');
      FakeEventSource.global().emit({ type: 'usage', agent: 'keboola-expert', input: 12_000, output: 300, cached: 11_000 }, 't1');
    });
    expect(stat('Работают')).toHaveTextContent('1');
    const tokens = stat('Токены');
    expect(tokens).toHaveTextContent('12.3k');
    expect(tokens).toHaveAttribute('title', expect.stringContaining('Вход 12.0k'));
    expect(tokens).toHaveAttribute('title', expect.stringContaining('Из кеша 11.0k'));
    expect(tokens).toHaveAttribute('title', expect.stringContaining('Выход 300'));
  });

  it('offers to survey a project the team does not know yet, once, and hides the offer when it is done', async () => {
    let status: Record<string, unknown> = { project: 'sandbox', profiled: false, running: false };
    const api = await openHome({
      'GET /api/onboarding': () => status,
      'POST /api/onboarding/start': () => {
        status = { ...status, threadId: 't9', running: true };
        return { threadId: 't9' };
      },
      'GET /api/threads/t9/messages': [],
      'GET /api/threads/t9/policy': { allowSql: false },
    });
    const card = await screen.findByRole('region', { name: 'Инициализация проекта' });
    expect(card).toHaveTextContent('sandbox');

    await userEvent.click(within(card).getByRole('button', { name: 'Запустить инициализацию' }));
    expect(api.callsTo('POST', '/api/onboarding/start')[0]?.body).toEqual({ text: expect.stringContaining('sandbox') });
    const open = await within(card).findByRole('button', { name: 'Открыть чат' });
    expect(within(card).queryByRole('button', { name: 'Запустить инициализацию' })).toBeNull();

    // The running init opens in the chat popup over the aquarium.
    await userEvent.click(open);
    const chat = screen.getByRole('dialog', { name: 'Чат' });
    expect(within(chat).getByRole('link', { name: 'Открыть в чатах' })).toHaveAttribute('href', '/chat/t9');

    // The profile is written early; the card stays until the whole init is over.
    status = { project: 'sandbox', profiled: true, running: true, threadId: 't9', updatedAt: '2026-10-24T10:00:00Z' };
    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't9'));
    await waitFor(() => expect(api.callsTo('GET', '/api/onboarding').length).toBeGreaterThanOrEqual(2));
    await act(async () => {});
    expect(within(card).getByRole('button', { name: 'Открыть чат' })).toBeInTheDocument();
    status = { project: 'sandbox', profiled: true, running: false, updatedAt: '2026-10-24T10:00:00Z' };
    act(() => FakeEventSource.global().emit({ type: 'run.finished', runId: 'r' }, 't9'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Инициализация проекта' })).toBeNull());
  });

  it('lets the setup card collapse to its title and expand again', async () => {
    await openHome({ 'GET /api/onboarding': { project: 'sandbox', profiled: false, running: false } });
    const card = await screen.findByRole('region', { name: 'Инициализация проекта' });
    const toggle = within(card).getByRole('button', { name: 'Свернуть' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(toggle);
    expect(within(card).queryByRole('button', { name: 'Запустить инициализацию' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Развернуть' })).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(within(card).getByRole('button', { name: 'Развернуть' }));
    expect(within(card).getByRole('button', { name: 'Запустить инициализацию' })).toBeInTheDocument();
  });

  it('starts the setup card collapsed on a phone, so the aquarium stays in view', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    await openHome({ 'GET /api/onboarding': { project: 'sandbox', profiled: false, running: false } });
    const card = await screen.findByRole('region', { name: 'Инициализация проекта' });
    expect(within(card).getByRole('button', { name: 'Развернуть' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByRole('button', { name: 'Запустить инициализацию' })).toBeNull();
  });

  it('shows the setup checklist in place of the survey offer until every step passes', async () => {
    let setup = setupReport({
      kbagent: { status: 'fail', reason: 'kbagentMissing', detail: 'not installed or not on PATH' },
      projects: { status: 'blocked', detail: 'waiting for kbagent' },
      project: { status: 'blocked', detail: 'waiting for kbagent' },
    });
    await openHome({ 'GET /api/setup': () => setup, 'GET /api/onboarding': { project: 'sandbox', profiled: false, running: false } });

    const card = await screen.findByRole('region', { name: 'Завершите настройку' });
    expect(within(card).getByText('4. kbagent установлен')).toBeInTheDocument();
    expect(within(card).getByText('not installed or not on PATH')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Свернуть' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Инициализация проекта' })).toBeNull();

    setup = SETUP_COMPLETE;
    await userEvent.click(within(card).getByRole('button', { name: 'Проверить снова' }));
    expect(await screen.findByRole('region', { name: 'Инициализация проекта' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Завершите настройку' })).toBeNull();
  });

  it('shows the checklist when the setup cannot be checked at all', async () => {
    await openHome({ 'GET /api/setup': () => errorResponse(500, 'Internal error'), 'GET /api/onboarding': { project: 'sandbox', profiled: false, running: false } });
    const card = await screen.findByRole('region', { name: 'Завершите настройку' });
    expect(within(card).getByText('Не удалось проверить настройку: Internal error')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Инициализация проекта' })).toBeNull();
  });

  it('offers no survey without a Keboola project or once the project is profiled', async () => {
    await openHome({ 'GET /api/onboarding': { project: '', profiled: false, running: false } });
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Инициализация проекта' })).toBeNull();
  });
});
