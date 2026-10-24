import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { DEFAULT_SETTINGS } from './api/types.ts';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from './test-utils/fake-api.ts';
import { baseRoutes, TEAM } from './test-utils/fixtures.ts';

const visit = (path: string) => window.history.pushState({}, '', path);

/** A PUT /api/settings handler that keeps what was saved, like the server. */
function savedSettings() {
  let current = { ...DEFAULT_SETTINGS };
  return (body: unknown) => {
    current = { ...current, ...(body as object) };
    return current;
  };
}

const SYSTEM = {
  app: { ok: true, detail: '0.1.0' },
  node: { ok: true, detail: 'v24.14.0' },
  omniroute: { ok: true, detail: '2 models' },
  model: { ok: true, detail: 'a/model' },
  kbagent: { ok: false, detail: 'not installed' },
};

const settingsRoutes = {
  'GET /api/models': { models: ['a/model', 'b/model'], current: 'a/model' },
  'GET /api/keboola/projects': { projects: [{ alias: 'sandbox', name: 'Sandbox', id: 6487, stackUrl: 'https://x', isDefault: true }], current: 'sandbox' },
  'GET /api/memory': { content: '# Shared memory\n- Backend is BigQuery' },
  'GET /api/system': SYSTEM,
};

beforeEach(() => {
  stubEventSource();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('App shell', () => {
  it('opens the aquarium by default and for unknown paths', async () => {
    stubApi(baseRoutes);
    visit('/');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Аквариум' })).toHaveClass('topbar__link--active');
    expect(screen.getByTestId('aquarium-view')).toBeInTheDocument();

    visit('/nope');
    render(<App />);
    expect(window.location.pathname).toBe('/');
  });

  it('redirects the old team page to agents', async () => {
    stubApi(baseRoutes);
    visit('/team');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Агенты' })).toHaveClass('topbar__link--active');
    expect(window.location.pathname).toBe('/agents');
  });

  it('shows the live connection, project, model and pending approvals in the top bar', async () => {
    stubApi({
      ...baseRoutes,
      'GET /api/approvals': [{ threadId: 't1', threadTitle: 'Chat', interruptId: 'i', requests: [{ tool: 'write_file', args: {}, decisions: [] }] }],
    });
    visit('/');
    render(<App />);

    expect(await screen.findByText('sandbox')).toBeInTheDocument();
    expect(screen.getByText('cc/model')).toBeInTheDocument();
    expect(screen.getByText('Нет связи')).toBeInTheDocument();
    act(() => FakeEventSource.global().open());
    expect(screen.getByText('Онлайн')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Подтверждения/ })).getByText('1')).toBeInTheDocument();
    act(() => FakeEventSource.global().fail());
    expect(screen.getByText('Нет связи')).toBeInTheDocument();
  });
});

describe('Settings page', () => {
  it('switches language and theme, and applies the theme to the page', async () => {
    const { callsTo } = stubApi({
      ...baseRoutes,
      ...settingsRoutes,
      'PUT /api/settings': savedSettings(),
    });
    visit('/settings');
    render(<App />);

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Язык ответов и интерфейса' }), 'en');
    expect(callsTo('PUT', '/api/settings')[0]?.body).toEqual({ language: 'en' });
    expect(await screen.findByRole('link', { name: 'Aquarium' })).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(callsTo('PUT', '/api/settings')[1]?.body).toEqual({ theme: 'light' });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));

    await userEvent.click(screen.getByRole('radio', { name: 'Low' }));
    expect(callsTo('PUT', '/api/settings')[2]?.body).toEqual({ quality: 'low' });
  });

  it('picks the model and Keboola project, toggles default SQL and shows memory and system checks', async () => {
    const { callsTo } = stubApi({
      ...baseRoutes,
      ...settingsRoutes,
      'PUT /api/settings': savedSettings(),
    });
    visit('/settings');
    render(<App />);

    const model = await screen.findByRole('combobox', { name: 'Модель по умолчанию' });
    await screen.findByRole('option', { name: 'b/model' });
    await userEvent.selectOptions(model, 'b/model');
    expect(callsTo('PUT', '/api/settings')[0]?.body).toEqual({ model: 'b/model' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Проект по умолчанию' }), 'sandbox');
    expect(callsTo('PUT', '/api/settings')[1]?.body).toEqual({ keboolaProject: 'sandbox' });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Разрешать SQL в новых чатах по умолчанию' }));
    expect(callsTo('PUT', '/api/settings')[2]?.body).toEqual({ allowSqlByDefault: true });

    expect(screen.getByText(/Backend is BigQuery/)).toBeInTheDocument();
    expect(await screen.findByText('not installed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(callsTo('GET', '/api/system')).toHaveLength(2);
  });

  it('explains when OmniRoute, kbagent or saving fail', async () => {
    stubApi({
      ...baseRoutes,
      'GET /api/models': () => errorResponse(502, 'down'),
      'GET /api/keboola/projects': () => errorResponse(502, 'down'),
      'GET /api/memory': { content: '' },
      'GET /api/system': () => errorResponse(500, 'Internal error'),
      'PUT /api/settings': () => errorResponse(400, 'Invalid request'),
    });
    visit('/settings');
    render(<App />);

    expect(await screen.findByText('OmniRoute недоступен')).toBeInTheDocument();
    expect(await screen.findByText('kbagent недоступен')).toBeInTheDocument();
    expect(screen.getByText('Пока ничего не запомнено.')).toBeInTheDocument();
    expect(await screen.findByText('Internal error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Светлая' }));
    expect(await screen.findByText('Invalid request')).toBeInTheDocument();
  });
});

describe('Agents page', () => {
  it('lists agents by group, filters them and opens details', async () => {
    stubApi(baseRoutes);
    visit('/agents');
    render(<App />);

    await screen.findByRole('button', { name: /keboola-expert/ });
    const rows = screen.getAllByRole('row');
    expect(rows.slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      expect.stringContaining('lead'),
      expect.stringContaining('keboola-expert'),
      expect.stringContaining('component-builder'),
    ]);
    expect(screen.getByText('keboola-expert: unknown skill "ghost"')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Выключены' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Все' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Группа' }), 'keboola');
    expect(screen.getAllByRole('row')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /keboola-expert/ }));
    const drawer = screen.getByRole('complementary', { name: 'keboola-expert' });
    expect(within(drawer).getByText('Answers Keboola questions.')).toBeInTheDocument();
    expect(within(drawer).getByText('vendor/keboola/cli/plugins/kbagent/agents/keboola-expert.md')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('complementary', { name: 'keboola-expert' })).toBeNull();
  });

  it('refetches the team when agents change on disk, without a page reload', async () => {
    let team = TEAM;
    const api = stubApi({ ...baseRoutes, 'GET /api/team': () => team });
    visit('/agents');
    render(<App />);
    await screen.findByRole('button', { name: /keboola-expert/ });
    expect(screen.queryByRole('button', { name: /scout/ })).toBeNull();

    team = { ...TEAM, agents: [...TEAM.agents, { name: 'scout', description: 'Scouts sources.', role: 'subagent', enabled: true, skills: [], tools: [] }] };
    act(() => FakeEventSource.global().emit({ type: 'team.updated' }, '_system'));
    expect(await screen.findByRole('button', { name: /scout/ })).toBeInTheDocument();
    expect(api.callsTo('GET', '/api/team')).toHaveLength(2);
  });

  it('still renders when the team cannot be loaded', async () => {
    stubApi({ 'GET /api/settings': DEFAULT_SETTINGS });
    visit('/agents');
    render(<App />);
    expect(await screen.findByText('Команда')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });
});
