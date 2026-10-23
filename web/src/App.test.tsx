import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { stubApi, stubEventSource } from './test-utils/fake-api.ts';
import { baseRoutes } from './test-utils/fixtures.ts';

const visit = (path: string) => window.history.pushState({}, '', path);

beforeEach(() => {
  stubEventSource();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App routing', () => {
  it('opens the chat by default and for unknown paths', async () => {
    stubApi(baseRoutes);
    visit('/');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Чат' })).toHaveClass('topbar__link--active');
    expect(window.location.pathname).toBe('/chat');

    visit('/nope');
    render(<App />);
    expect(window.location.pathname).toBe('/chat');
  });
});

describe('Settings page', () => {
  it('switches the reply and interface language', async () => {
    const { callsTo } = stubApi({
      ...baseRoutes,
      'PUT /api/settings': (body: unknown) => ({ language: 'ru', ...(body as object) }),
    });
    visit('/settings');
    render(<App />);

    const select = await screen.findByRole('combobox', { name: 'Язык ответов и интерфейса' });
    expect(select).toHaveValue('ru');
    await userEvent.selectOptions(select, 'en');

    expect(callsTo('PUT', '/api/settings')[0]?.body).toEqual({ language: 'en' });
    expect(await screen.findByRole('link', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('en');
  });

  it('starts in the saved language', async () => {
    stubApi({ ...baseRoutes, 'GET /api/settings': { language: 'cs' } });
    visit('/settings');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Nastavení' })).toHaveClass('topbar__link--active');
  });
});

describe('Team page', () => {
  it('lists the lead first, then enabled agents, then disabled ones, with warnings', async () => {
    stubApi(baseRoutes);
    visit('/team');
    render(<App />);

    const names = (await screen.findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
    expect(names).toEqual(['lead', 'keboola-expert', 'component-builder']);

    const [lead, expert, builder] = screen.getAllByRole('article');
    expect(within(lead as HTMLElement).getByText('Лид')).toBeInTheDocument();
    expect(within(expert as HTMLElement).getByText('Keboola: чтение')).toBeInTheDocument();
    expect(within(expert as HTMLElement).getByText(/Основан на/)).toBeInTheDocument();
    expect(within(builder as HTMLElement).getByText('Выключен')).toBeInTheDocument();
    expect(builder).toHaveClass('agent-card--disabled');
    expect(screen.getByText('keboola-expert: unknown skill "ghost"')).toBeInTheDocument();
  });

  it('still renders when the team cannot be loaded', async () => {
    stubApi({ 'GET /api/settings': { language: 'ru' } });
    visit('/team');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Команда' })).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toEqual([]);
  });
});
