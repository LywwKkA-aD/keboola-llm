import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import type { TeamInfo, VersionSummary } from '../../api/types.ts';
import { FakeEventSource, errorResponse, stubApi, stubEventSource } from '../../test-utils/fake-api.ts';
import { baseRoutes, TEAM } from '../../test-utils/fixtures.ts';
import { HISTORY_REFRESH_MS } from '../versions/VersionHistory.tsx';

const team: TeamInfo = {
  ...TEAM,
  agents: TEAM.agents.map((agent) =>
    agent.name === 'component-builder' ? { ...agent, description: 'Builds Python components. Disabled: needs a shell and file writes.' } : agent,
  ),
  skills: [...TEAM.skills, { name: 'sql-style', description: 'House SQL style rules. Use for SQL.', source: 'custom' }],
};

const CURRENT = 'name: keboola-expert\nenabled: true\nnew line\n';
const OLD = 'name: keboola-expert\nenabled: true\nold line\n';
const VERSIONS: VersionSummary[] = [
  { id: 3, at: '2026-10-24T10:30:00Z', change: 'changed', size: 46 },
  { id: 2, at: '2026-10-24T10:00:00Z', change: 'restored', size: 46, restoredFrom: 1 },
  { id: 1, at: '2026-10-23T10:00:00Z', change: 'baseline', size: 46 },
];
const expertVersions = '/api/definitions/agents/keboola-expert/versions';

function open(path: string, routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, 'GET /api/team': team, 'GET /api/definitions/agents': [], 'GET /api/definitions/skills': [], ...routes });
  window.history.pushState({}, '', path);
  render(<App />);
  return api;
}

async function openAgent(name: string, routes: Record<string, unknown> = {}) {
  const api = open('/agents', routes);
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
  return { api, drawer: screen.getByRole('complementary', { name }) };
}

const history = (drawer: HTMLElement) => within(drawer).getByRole('region', { name: 'История' });

beforeEach(() => {
  stubEventSource();
});

describe('why an agent is disabled', () => {
  it('shows the reason as a hint in the list and prominently in the drawer', async () => {
    const { drawer } = await openAgent('component-builder');
    expect(screen.getAllByText('needs a shell and file writes.')).toHaveLength(2);
    expect(within(drawer).getByText('Почему выключен')).toBeInTheDocument();
    expect(within(drawer).getByText('Builds Python components.')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Проверить агента' })).toBeNull();
  });

  it('says so when a disabled agent gives no reason', async () => {
    const { drawer } = await openAgent('component-builder', {
      'GET /api/team': { ...team, agents: team.agents.map((agent) => (agent.enabled ? agent : { ...agent, description: 'Builds things.' })) },
    });
    expect(within(drawer).getByText('Выключен в AGENT.md (enabled: false), причина не указана.')).toBeInTheDocument();
  });
});

describe('Check agent', () => {
  it('starts a chat asking the lead to try the agent and follows it', async () => {
    const { api, drawer } = await openAgent('keboola-expert', {
      'POST /api/threads': { thread: { id: 't9', title: 'Check', createdAt: '', updatedAt: '' }, runId: 'r' },
    });
    await userEvent.click(within(drawer).getByRole('button', { name: 'Проверить агента' }));

    const body = api.callsTo('POST', '/api/threads')[0]?.body as { text: string };
    // The first line becomes the chat title.
    expect(body.text.split('\n')[0]).toBe('Проверка агента «keboola-expert».');
    expect(body.text).toContain('только на чтение');
    expect(within(drawer).getByRole('link', { name: 'Открыть чат' })).toHaveAttribute('href', '/chat/t9');
    expect(within(drawer).getByText('Лид проверяет агента.')).toBeInTheDocument();

    await waitFor(() => expect(() => FakeEventSource.forThread('t9')).not.toThrow());
    act(() => {
      FakeEventSource.forThread('t9').emit({ type: 'run.started', runId: 'r' });
      FakeEventSource.forThread('t9').emit({ type: 'run.finished', runId: 'r' });
    });
    expect(within(drawer).getByText('Проверка закончена.')).toBeInTheDocument();
  });

  it('is not offered for the lead and reports a failure to start', async () => {
    const { drawer } = await openAgent('lead');
    expect(within(drawer).queryByRole('button', { name: 'Проверить агента' })).toBeNull();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Закрыть' }));

    await userEvent.click(screen.getByRole('button', { name: /^keboola-expert/ }));
    stubApi({ ...baseRoutes, 'GET /api/team': team, 'POST /api/threads': () => errorResponse(500, 'Internal error') });
    const expert = screen.getByRole('complementary', { name: 'keboola-expert' });
    await userEvent.click(within(expert).getByRole('button', { name: 'Проверить агента' }));
    expect(await within(expert).findByText('Internal error')).toBeInTheDocument();
  });
});

describe('agent history', () => {
  it('shows a version as a diff against the current file and restores it after an in-app confirmation', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    let versions = VERSIONS;
    const { api, drawer } = await openAgent('keboola-expert', {
      [`GET ${expertVersions}`]: () => versions,
      [`GET ${expertVersions}/1`]: { ...VERSIONS[2], content: OLD, current: CURRENT },
      [`POST ${expertVersions}/1/restore`]: () => {
        versions = [{ id: 4, at: '2026-10-24T11:00:00Z', change: 'restored', size: 46, restoredFrom: 1 }, ...VERSIONS];
        return { changed: true, version: versions[0] };
      },
    });
    const section = history(drawer);
    const items = await within(section).findAllByRole('button', { expanded: false });
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/Изменён.*Последняя.*46 B/),
      expect.stringMatching(/Восстановлен.*из версии 1/),
      expect.stringContaining('Первая запись'),
    ]);

    await userEvent.click(items[2] as HTMLElement);
    const diff = await within(section).findByRole('list', { name: 'Версия 1' });
    expect(within(diff).getAllByRole('listitem').map((line) => line.textContent)).toEqual([' name: keboola-expert', ' enabled: true', '-new line', '+old line']);

    await userEvent.click(within(section).getByRole('button', { name: 'Восстановить эту версию' }));
    const question = within(section).getByRole('group', { name: 'Восстановить эту версию' });
    expect(question).toHaveTextContent('Заменить текущий файл версией 1?');
    await userEvent.click(within(question).getByRole('button', { name: 'Отмена' }));
    expect(api.callsTo('POST', `${expertVersions}/1/restore`)).toHaveLength(0);

    await userEvent.click(within(section).getByRole('button', { name: 'Восстановить эту версию' }));
    await userEvent.click(within(section).getByRole('button', { name: 'Восстановить' }));
    expect(api.callsTo('POST', `${expertVersions}/1/restore`)).toHaveLength(1);
    expect(await within(section).findByText('Восстановлено. Команда подхватит изменение через мгновение.')).toBeInTheDocument();
    expect(await within(section).findAllByRole('button', { expanded: false })).toHaveLength(4);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('offers no restore for the current content or a deletion, and explains a missing file', async () => {
    const { drawer } = await openAgent('keboola-expert', {
      [`GET ${expertVersions}`]: [
        { id: 3, at: '2026-10-24T10:30:00Z', change: 'created', size: 46 },
        { id: 2, at: '2026-10-24T10:00:00Z', change: 'deleted', size: 0 },
        { id: 1, at: '2026-10-23T10:00:00Z', change: 'baseline', size: 46 },
      ],
      [`GET ${expertVersions}/3`]: { id: 3, at: '', change: 'created', size: 46, content: CURRENT, current: CURRENT },
      [`GET ${expertVersions}/2`]: { id: 2, at: '', change: 'deleted', size: 0, content: null, current: CURRENT },
      [`GET ${expertVersions}/1`]: { id: 1, at: '', change: 'baseline', size: 46, content: OLD, current: null },
    });
    const section = history(drawer);
    const [latest, deleted, first] = await within(section).findAllByRole('button', { expanded: false });

    await userEvent.click(latest as HTMLElement);
    expect(await within(section).findByText('Совпадает с текущим файлом.')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Восстановить эту версию' })).toBeNull();

    await userEvent.click(deleted as HTMLElement);
    expect(await within(section).findByText(/В этот момент файл был удалён/)).toBeInTheDocument();

    await userEvent.click(first as HTMLElement);
    expect(await within(section).findByText('Сейчас файла нет; восстановление создаст его заново.')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Восстановить эту версию' })).toBeInTheDocument();
  });

  it('reloads the history when the team changes on disk and shows load errors', async () => {
    let versions: VersionSummary[] = [];
    const { api, drawer } = await openAgent('keboola-expert', { [`GET ${expertVersions}`]: () => versions });
    const section = history(drawer);
    expect(await within(section).findByText('Версий пока нет.')).toBeInTheDocument();

    versions = VERSIONS;
    act(() => FakeEventSource.global().emit({ type: 'team.updated' }, '_system'));
    expect(await within(section).findAllByRole('button', { expanded: false })).toHaveLength(3);
    expect(api.callsTo('GET', expertVersions).length).toBeGreaterThan(1);
  });

  it('reloads an open history every few seconds, so an edit no event announced still shows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let versions: VersionSummary[] = [VERSIONS[2] as VersionSummary];
      const { drawer } = await openAgent('keboola-expert', { [`GET ${expertVersions}`]: () => versions });
      const section = history(drawer);
      expect(await within(section).findAllByRole('button', { expanded: false })).toHaveLength(1);

      versions = VERSIONS;
      await act(async () => {
        vi.advanceTimersByTime(HISTORY_REFRESH_MS);
      });
      expect(await within(section).findAllByRole('button', { expanded: false })).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a failed restore in place', async () => {
    const { drawer } = await openAgent('keboola-expert', {
      [`GET ${expertVersions}`]: VERSIONS,
      [`GET ${expertVersions}/1`]: { ...VERSIONS[2], content: OLD, current: CURRENT },
      [`POST ${expertVersions}/1/restore`]: () => errorResponse(409, 'This version records a deletion; restore an earlier one'),
    });
    const section = history(drawer);
    const items = await within(section).findAllByRole('button', { expanded: false });
    await userEvent.click(items[2] as HTMLElement);
    await userEvent.click(await within(section).findByRole('button', { name: 'Восстановить эту версию' }));
    await userEvent.click(within(section).getByRole('button', { name: 'Восстановить' }));
    expect(await within(section).findByText('This version records a deletion; restore an earlier one')).toBeInTheDocument();
  });
});

describe('Skills tab', () => {
  it('lists skills with their source, the app own first, and keeps history for custom ones only', async () => {
    open('/agents', { 'GET /api/definitions/skills/sql-style/versions': [VERSIONS[2]] });
    await userEvent.click(await screen.findByRole('tab', { name: /Скиллы/ }));
    expect(window.location.search).toBe('?tab=skills');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['sql-styleHouse SQL style rules', 'Свой'],
      ['kbagentCLI', 'cli-kbagent'],
    ]);

    await userEvent.click(screen.getByRole('button', { name: /^sql-style/ }));
    const custom = screen.getByRole('complementary', { name: 'sql-style' });
    expect(within(custom).getByText('House SQL style rules. Use for SQL.')).toBeInTheDocument();
    expect(await within(history(custom)).findByText('Первая запись')).toBeInTheDocument();
    await userEvent.click(within(custom).getByRole('button', { name: 'Закрыть' }));

    await userEvent.click(screen.getByRole('button', { name: /^kbagent/ }));
    const vendored = screen.getByRole('complementary', { name: 'kbagent' });
    expect(within(vendored).getByText(/Официальный скилл Keboola/)).toBeInTheDocument();
    expect(within(vendored).queryByRole('region', { name: 'История' })).toBeNull();

    await userEvent.click(within(vendored).getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(screen.getByRole('tab', { name: /Агенты/ }));
    expect(window.location.search).toBe('');
    expect(await screen.findByRole('button', { name: /^keboola-expert/ })).toBeInTheDocument();
  });
});

describe('removed or broken definitions', () => {
  it('lists what has a history but is not in the team and opens its history', async () => {
    open('/agents', {
      'GET /api/definitions/agents': [
        { name: 'keboola-expert', exists: true, last: VERSIONS[0] },
        { name: 'old-scout', exists: false, last: { id: 2, at: '2026-10-24T09:00:00Z', change: 'deleted', size: 0 } },
        { name: 'half-written', exists: true, last: VERSIONS[0] },
      ],
      'GET /api/definitions/agents/old-scout/versions': [{ id: 2, at: '2026-10-24T09:00:00Z', change: 'deleted', size: 0 }, VERSIONS[2]],
    });
    const removed = await screen.findByRole('region', { name: 'Удалены или не загружаются' });
    expect(within(removed).getAllByRole('button').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^old-scoutУдалён/),
      expect.stringMatching(/^half-writtenНе загружается/),
    ]);

    await userEvent.click(within(removed).getByRole('button', { name: /old-scout/ }));
    const drawer = screen.getByRole('complementary', { name: 'old-scout' });
    expect(within(drawer).getByRole('heading', { name: 'old-scout' })).toBeInTheDocument();
    expect(await within(history(drawer)).findByText('Первая запись')).toBeInTheDocument();
  });

  it('lists nothing until the team is known, so present agents never flash as removed', async () => {
    const api = open('/agents', {
      'GET /api/team': () => errorResponse(500, 'Internal error'),
      'GET /api/definitions/agents': [{ name: 'keboola-expert', exists: true, last: VERSIONS[0] }],
    });
    await waitFor(() => expect(api.callsTo('GET', '/api/definitions/agents')).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Удалены или не загружаются' })).toBeNull();
  });
});
