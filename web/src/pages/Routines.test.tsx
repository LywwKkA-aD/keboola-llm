import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import type { RoutineInfo, RoutineList } from '../api/routines.ts';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

const MORNING: RoutineInfo = {
  name: 'morning-check',
  title: 'Morning check',
  description: 'Weekday health check of the project.',
  schedule: '0 8 * * 1-5',
  timezone: 'Mars/Base',
  enabled: false,
};

const REFRESH: RoutineInfo = {
  name: 'profile-refresh',
  title: 'Profile refresh',
  description: 'Weekly refresh of the project profile.',
  schedule: '0 7 * * 1',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  enabled: true,
  nextRun: '2026-11-02T06:00:00.000Z',
  lastRun: { at: '2026-10-26T06:00:00.000Z', threadId: 't2', running: false },
};

const settingsRoutes = {
  'GET /api/models': { models: [], current: '' },
  'GET /api/keboola/projects': { projects: [], current: '' },
  'GET /api/memory': { content: '' },
  'GET /api/system': () => errorResponse(500, 'Internal error'),
};

const visit = (path: string) => window.history.pushState({}, '', path);

beforeEach(() => {
  stubEventSource();
});

async function openSettings(routes: Record<string, unknown>) {
  const api = stubApi({ ...baseRoutes, ...settingsRoutes, ...routes });
  visit('/settings');
  render(<App />);
  const section = await screen.findByRole('region', { name: 'Регулярные задачи' });
  return { api, section };
}

describe('Routines in Settings', () => {
  it('lists each routine with its schedule in words, next and last run, and the files that failed to load', async () => {
    const list: RoutineList = { routines: [MORNING, REFRESH], loadErrors: [{ file: 'routines/broken.md', message: 'hour: "99" is not a value in 0-23' }] };
    const { section } = await openSettings({ 'GET /api/routines': list });

    const morning = await within(section).findByRole('listitem', { name: 'Morning check' });
    expect(morning).toHaveTextContent('Weekday health check of the project.');
    expect(morning).toHaveTextContent('По будням · 08:00 (Mars/Base)');
    expect(morning).toHaveTextContent('Не запланирована');
    expect(morning).toHaveTextContent('Ещё не запускалась');
    expect(within(morning).getByRole('checkbox', { name: 'Запускать по расписанию' })).not.toBeChecked();

    const refresh = within(section).getByRole('listitem', { name: 'Profile refresh' });
    expect(refresh).toHaveTextContent(/пн · 07:00Следующий запуск/);
    expect(within(refresh).getByRole('checkbox', { name: 'Запускать по расписанию' })).toBeChecked();
    expect(within(refresh).getByRole('link', { name: /Последний запуск/ })).toHaveAttribute('href', '/chat/t2');

    expect(within(section).getByText('routines/broken.md: hour: "99" is not a value in 0-23')).toBeInTheDocument();
  });

  it('switches a routine on and shows what the server stored', async () => {
    let stored = MORNING;
    const { api, section } = await openSettings({
      'GET /api/routines': () => ({ routines: [stored], loadErrors: [] }),
      'PUT /api/routines/morning-check': (body: unknown) => {
        stored = { ...stored, ...(body as object), nextRun: '2026-10-26T07:00:00.000Z' };
        return stored;
      },
    });
    const row = await within(section).findByRole('listitem', { name: 'Morning check' });

    await userEvent.click(within(row).getByRole('checkbox', { name: 'Запускать по расписанию' }));
    expect(api.callsTo('PUT', '/api/routines/morning-check')[0]?.body).toEqual({ enabled: true });
    await waitFor(() => expect(within(row).getByRole('checkbox', { name: 'Запускать по расписанию' })).toBeChecked());
    expect(row).toHaveTextContent('Следующий запуск');
  });

  it('puts the switch back when the server refuses it', async () => {
    const { section } = await openSettings({
      'GET /api/routines': { routines: [MORNING], loadErrors: [] },
      'PUT /api/routines/morning-check': () => errorResponse(400, 'Invalid request'),
    });
    const row = await within(section).findByRole('listitem', { name: 'Morning check' });

    await userEvent.click(within(row).getByRole('checkbox', { name: 'Запускать по расписанию' }));
    expect(await within(section).findByText('Invalid request')).toBeInTheDocument();
    await waitFor(() => expect(within(row).getByRole('checkbox', { name: 'Запускать по расписанию' })).not.toBeChecked());
  });

  it('runs a routine now, links its chat and blocks a second run while it goes', async () => {
    let stored = MORNING;
    const { api, section } = await openSettings({
      'GET /api/routines': () => ({ routines: [stored], loadErrors: [] }),
      'POST /api/routines/morning-check/run': () => {
        stored = { ...stored, lastRun: { at: '2026-10-26T07:30:00.000Z', threadId: 't9', running: true } };
        return { threadId: 't9' };
      },
    });
    const row = await within(section).findByRole('listitem', { name: 'Morning check' });

    await userEvent.click(within(row).getByRole('button', { name: 'Запустить сейчас' }));
    expect(api.callsTo('POST', '/api/routines/morning-check/run')).toHaveLength(1);
    expect(await within(row).findByRole('link', { name: /Последний запуск/ })).toHaveAttribute('href', '/chat/t9');
    expect(within(row).getByText('Выполняется')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Запустить сейчас' })).toBeDisabled();

    // The run ends: the list is fetched again and the routine can run again.
    stored = { ...stored, lastRun: { at: '2026-10-26T07:30:00.000Z', threadId: 't9', running: false } };
    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't9'));
    act(() => FakeEventSource.global().emit({ type: 'run.finished', runId: 'r' }, 't9'));
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Запустить сейчас' })).toBeEnabled());
  });

  it('explains when a run cannot start', async () => {
    const { section } = await openSettings({
      'GET /api/routines': { routines: [MORNING], loadErrors: [] },
      'POST /api/routines/morning-check/run': () => errorResponse(409, 'This routine is still running'),
    });
    await userEvent.click(await within(section).findByRole('button', { name: 'Запустить сейчас' }));
    expect(await within(section).findByText('This routine is still running')).toBeInTheDocument();
  });

  it('says when there are no routines', async () => {
    const { section } = await openSettings({ 'GET /api/routines': { routines: [], loadErrors: [] } });
    expect(await within(section).findByText('Регулярных задач пока нет. Попросите agent-builder создать задачу.')).toBeInTheDocument();
  });

  it('shows the error when the list fails', async () => {
    const { section } = await openSettings({ 'GET /api/routines': () => errorResponse(500, 'Internal error') });
    expect(await within(section).findByText('Internal error')).toBeInTheDocument();
  });
});

describe('Latest routine runs in the Home chats panel', () => {
  async function openChats(routes: Record<string, unknown>) {
    const api = stubApi({ ...baseRoutes, ...routes });
    visit('/');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Чаты' }));
    return { api, panel: screen.getByRole('dialog', { name: 'Чаты' }) };
  }

  it('lists the latest runs, newest first, marks a run that still goes and opens its chat in the popup', async () => {
    const running: RoutineInfo = { ...MORNING, lastRun: { at: '2026-10-27T07:00:00.000Z', threadId: 't9', running: true } };
    const { panel } = await openChats({ 'GET /api/routines': { routines: [REFRESH, running, { ...MORNING, name: 'never' }], loadErrors: [] } });

    const block = await within(panel).findByRole('region', { name: 'Последние запуски по расписанию' });
    const runs = within(block).getAllByRole('button');
    expect(runs.map((run) => run.querySelector('.chat-item__title')?.textContent)).toEqual(['Morning check', 'Profile refresh']);
    expect(block.querySelectorAll('.dot--pulse')).toHaveLength(1);

    await userEvent.click(within(block).getByRole('button', { name: /Profile refresh/ }));
    expect(screen.queryByRole('dialog', { name: 'Чаты' })).toBeNull();
    expect(await within(screen.getByRole('dialog', { name: 'Чат' })).findByRole('heading', { name: 'Почему упал джоб?' })).toBeInTheDocument();
  });

  it('is hidden when no routine has run, and refetches when runs change', async () => {
    let list: RoutineList = { routines: [MORNING], loadErrors: [] };
    const { api, panel } = await openChats({ 'GET /api/routines': () => list });
    await waitFor(() => expect(api.callsTo('GET', '/api/routines').length).toBeGreaterThan(0));
    expect(within(panel).queryByRole('region', { name: 'Последние запуски по расписанию' })).toBeNull();

    list = { routines: [REFRESH], loadErrors: [] };
    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r' }, 't2'));
    expect(await within(panel).findByRole('region', { name: 'Последние запуски по расписанию' })).toBeInTheDocument();
  });

  it('stays hidden when routines cannot be listed', async () => {
    const { api, panel } = await openChats({ 'GET /api/routines': () => errorResponse(500, 'Internal error') });
    await waitFor(() => expect(api.callsTo('GET', '/api/routines').length).toBeGreaterThan(0));
    expect(within(panel).queryByRole('region', { name: 'Последние запуски по расписанию' })).toBeNull();
  });
});
