import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes, usageReport } from '../test-utils/fixtures.ts';
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
    expect(stat('Токенов сегодня')).toHaveTextContent('0');
    expect(stat('Из кеша')).toHaveTextContent('—');
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

  it('opens an action from the agent card in place: an edit shows its diff, a delegation its task and reply', async () => {
    await openHome();
    act(() => {
      const stream = FakeEventSource.global();
      stream.emit({ type: 'run.started', runId: 'r' }, 't1');
      stream.emit({ type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Найди таблицы с customer_id' }, 't1');
      stream.emit(
        { type: 'tool.start', agent: 'keboola-expert', callId: 'e1', tool: 'edit_file', args: { file_path: '/knowledge/tables.md', old_string: 'old line', new_string: 'new line' } },
        't1',
      );
      stream.emit({ type: 'tool.end', agent: 'keboola-expert', callId: 'e1', tool: 'edit_file', ok: true, preview: 'Updated file' }, 't1');
      stream.emit({ type: 'message', agent: 'keboola-expert', text: 'Нашёл **3** таблицы.' }, 't1');
      stream.emit({ type: 'delegate.end', agent: 'lead', callId: 'd1', to: 'keboola-expert', ok: true }, 't1');
    });
    await userEvent.click(within(await openTeam()).getByRole('button', { name: /keboola-expert/ }));
    const card = screen.getByRole('complementary', { name: 'keboola-expert' });
    const actions = within(card).getByRole('list', { name: 'Последние действия агента' });
    expect(within(actions).getAllByRole('button').map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Правка.*knowledge\/tables\.md.*Готово/),
      expect.stringMatching(/Задача от.*lead: Найди таблицы с customer_id.*Готово/),
    ]);

    await userEvent.click(within(actions).getByRole('button', { name: /Правка/ }));
    const detail = within(card).getByRole('region', { name: 'Действие' });
    expect(within(detail).getByText('/knowledge/tables.md')).toBeInTheDocument();
    const diff = within(detail).getByRole('list', { name: 'Изменение' });
    expect(within(diff).getAllByRole('listitem').map((line) => line.textContent)).toEqual(['-old line', '+new line']);
    expect(within(detail).getByText('Updated file')).toBeInTheDocument();
    expect(within(card).queryByRole('list', { name: 'Последние действия агента' })).toBeNull();

    await userEvent.click(within(detail).getByRole('button', { name: 'Назад' }));
    await userEvent.click(within(card).getByRole('button', { name: /Задача от/ }));
    const delegation = within(card).getByRole('region', { name: 'Действие' });
    expect(within(delegation).getByText('Найди таблицы с customer_id')).toBeInTheDocument();
    expect(within(delegation).getByText('3', { selector: 'strong' })).toBeInTheDocument();

    // The chat it happened in opens in the popup, the card stays.
    await userEvent.click(within(delegation).getByRole('button', { name: 'Открыть в чате' }));
    expect(await screen.findByRole('dialog', { name: 'Чат' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'keboola-expert' })).toBeInTheDocument();
  });

  it('shows an approval the agent waits for, with a way to answer it, and an empty card before anything happened', async () => {
    const request = { tool: 'write_file', agent: 'keboola-expert', args: { file_path: '/knowledge/new.md', content: '# New note' }, decisions: ['approve', 'reject'] };
    await openHome({ 'GET /api/approvals': [{ ...APPROVAL, interruptId: 'i7', requests: [request] }] });
    await userEvent.click(within(await openTeam()).getByRole('button', { name: /keboola-expert/ }));
    const card = screen.getByRole('complementary', { name: 'keboola-expert' });
    expect(within(card).getByText('С момента открытия страницы ничего не было. Более ранняя работа — в чатах.')).toBeInTheDocument();

    act(() => FakeEventSource.global().emit({ type: 'approval.required', interruptId: 'i7', requests: [request] }, 't1'));
    await userEvent.click(await within(card).findByRole('button', { name: /Подтверждение.*Ждёт вашего решения/ }));
    const detail = within(card).getByRole('region', { name: 'Действие' });
    expect(within(detail).getByText('# New note')).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Ответить в чате' }));
    expect(await screen.findByRole('dialog', { name: 'Чат' })).toBeInTheDocument();
  });

  it('shows what an agent did before the page was loaded, from the server', async () => {
    await openHome({
      'GET /api/activity': [
        { seq: 5, at: Date.UTC(2026, 9, 24, 10, 0), threadId: 't1', event: { type: 'tool.start', agent: 'keboola-expert', callId: 'e1', tool: 'edit_file', args: { file_path: '/knowledge/tables.md', old_string: 'old line', new_string: 'new line' } } },
        { seq: 6, at: Date.UTC(2026, 9, 24, 10, 1), threadId: 't1', event: { type: 'tool.end', agent: 'keboola-expert', callId: 'e1', tool: 'edit_file', ok: true, preview: 'Updated file' } },
      ],
    });
    const team = await openTeam();
    await userEvent.click(within(team).getByRole('button', { name: /keboola-expert/ }));
    const card = screen.getByRole('complementary', { name: 'keboola-expert' });
    const actions = await within(card).findByRole('list', { name: 'Последние действия агента' });
    await userEvent.click(within(actions).getByRole('button', { name: /Правка/ }));
    const diff = within(card).getByRole('list', { name: 'Изменение' });
    expect(within(diff).getAllByRole('listitem').map((line) => line.textContent)).toEqual(['-old line', '+new line']);
  });

  it('counts runs and approvals, and shows today\'s tokens with the cache share from the server', async () => {
    let report = usageReport({ calls: 3, input: 12_000, cached: 10_200, output: 300 });
    const api = await openHome({ 'GET /api/approvals': [APPROVAL], 'GET /api/usage': () => report });
    const approvals = await within(hud()).findByRole('button', { name: 'Подтверждения 1' });
    expect(approvals).toHaveClass('hud__btn--amber');
    expect(stat('Ждут')).toHaveTextContent('1');
    await waitFor(() => expect(stat('Токенов сегодня')).toHaveTextContent('12.3k'));
    expect(stat('Из кеша')).toHaveTextContent('85%');

    // Every model call refetches the report the server keeps (so a reload does not reset it).
    report = usageReport({ calls: 4, input: 40_000, cached: 38_000, output: 500 });
    const calls = api.callsTo('GET', '/api/usage').length;
    act(() => {
      FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't1');
      FakeEventSource.global().emit({ type: 'usage', agent: 'keboola-expert', input: 28_000, output: 200, cached: 27_800 }, 't1');
    });
    expect(stat('Работают')).toHaveTextContent('1');
    await waitFor(() => expect(stat('Токенов сегодня')).toHaveTextContent('40.5k'));
    expect(stat('Из кеша')).toHaveTextContent('95%');
    expect(api.callsTo('GET', '/api/usage').length).toBe(calls + 1);
  });

  it('opens the usage panel from the token stats: periods, the 14-day chart and today by agent', async () => {
    const today = { calls: 3, input: 12_000, cached: 10_200, cacheWrite: 1_500, output: 300 };
    await openHome({
      'GET /api/usage': {
        today,
        week: { ...today, input: 90_000, cached: 81_000 },
        total: { ...today, input: 400_000, cached: 300_000 },
        since: '2026-10-01',
        days: [{ date: '2026-10-23', calls: 1, input: 78_000, cached: 70_800, cacheWrite: 0, output: 100 }, { date: '2026-10-24', ...today }],
        agents: [
          { agent: 'keboola-expert', calls: 2, input: 9_000, cached: 8_100, cacheWrite: 0, output: 200 },
          { agent: 'lead', calls: 1, input: 3_000, cached: 2_100, cacheWrite: 1_500, output: 100 },
        ],
      },
    });
    const button = await within(hud()).findByRole('button', { name: /Токенов сегодня/ });
    await waitFor(() => expect(button).toHaveTextContent('12.3k'));
    await userEvent.click(button);
    const panel = screen.getByRole('dialog', { name: 'Расход токенов' });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    const tile = (label: string) => within(panel).getByText(label, { selector: '.usage-tile__label' }).closest('.usage-tile');
    expect(tile('Вход')).toHaveTextContent('12.0k3 вызовов модели');
    expect(tile('Из кеша')).toHaveTextContent('85%10.2k');
    expect(tile('Записано в кеш')).toHaveTextContent('1.5k');
    expect(tile('Выход')).toHaveTextContent('300');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['keboola-expert9.2k90%', 'lead3.1k70%']);
    expect(within(panel).getByRole('img', { name: /^23\.10: Вход 78\.0k · Из кеша 91%/ })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Всё время' }));
    expect(tile('Вход')).toHaveTextContent('400.0k');
    expect(tile('Из кеша')).toHaveTextContent('75%');
    expect(within(panel).getByText('Считается с 2026-10-01')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Расход токенов' })).toBeNull();
    expect(button).toHaveFocus();
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
