import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes, THREADS } from '../test-utils/fixtures.ts';
import { knowledgeRoutes } from '../test-utils/knowledge-fixtures.ts';

async function openKnowledge(path: string, routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...knowledgeRoutes, ...routes });
  window.history.pushState({}, '', path);
  render(<App />);
  await screen.findByRole('heading', { name: 'Что знает команда' });
  return api;
}

beforeEach(() => {
  stubEventSource();
});

describe('Knowledge page: memory', () => {
  it('opens on the memory tab from the link in Settings and edits the shared memory', async () => {
    const { callsTo } = await openKnowledge('/knowledge?tab=memory', {
      'PUT /api/memory': (body: unknown) => ({ content: (body as { content: string }).content, modifiedAt: '2026-10-24T11:00:00Z' }),
    });
    expect(screen.getByRole('tab', { name: 'Память' })).toHaveAttribute('aria-selected', 'true');
    const memory = await screen.findByRole('article', { name: 'AGENTS.md' });
    expect(within(memory).getByText('Бэкенд BigQuery')).toBeInTheDocument();

    await userEvent.click(within(memory).getByRole('button', { name: 'Изменить' }));
    const source = screen.getByRole('textbox', { name: 'Markdown' });
    await userEvent.type(source, '{enter}- Пишем CTE');
    expect(screen.getByText('Пишем CTE')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(callsTo('PUT', '/api/memory')[0]?.body).toEqual({ content: '# Общая память\n\n- Бэкенд BigQuery\n- Пишем CTE' });
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'AGENTS.md' })).getByText('Пишем CTE')).toBeInTheDocument();
  });

  it('shows project profiles read-only', async () => {
    await openKnowledge('/knowledge?tab=memory');
    await userEvent.click(await screen.findByRole('button', { name: /Проект sandbox/ }));
    const profile = await screen.findByRole('article', { name: 'projects/sandbox.md' });
    expect(profile).toHaveTextContent('Бэкенд BigQuery, 12 бакетов.');
    expect(within(profile).getByText('Только просмотр')).toBeInTheDocument();
    expect(within(profile).queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('says when nothing is remembered or profiled yet, and why saving failed', async () => {
    await openKnowledge('/knowledge?tab=memory', {
      'GET /api/memory': { content: '' },
      'GET /api/memory/projects': { profiles: [] },
      'PUT /api/memory': () => errorResponse(413, 'The note is larger than 64 KB'),
    });
    expect(await screen.findByText('Пока ничего не запомнено.')).toBeInTheDocument();
    expect(screen.getByText('Ни один проект ещё не изучен.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Markdown' }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('The note is larger than 64 KB')).toBeInTheDocument();
  });

  it('guards the draft when switching tabs', async () => {
    await openKnowledge('/knowledge?tab=memory');
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Markdown' }), ' правка');

    await userEvent.click(screen.getByRole('tab', { name: 'База знаний' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Не сохранять' }));
    expect(screen.getByRole('tab', { name: 'База знаний' })).toHaveAttribute('aria-selected', 'true');
    expect(new URLSearchParams(window.location.search).get('tab')).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Память' }));
    expect(await screen.findByRole('article', { name: 'AGENTS.md' })).not.toHaveTextContent('правка');
  });
});

describe('Knowledge page: organize', () => {
  it('asks knowledge-keeper in a new chat and links to it while it works', async () => {
    const thread = { ...THREADS[0], id: 't9' };
    const { callsTo } = await openKnowledge('/knowledge', { 'POST /api/threads': { thread, runId: 'r1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Попросить knowledge-keeper навести порядок' }));

    expect(callsTo('POST', '/api/threads')[0]?.body).toEqual({ text: expect.stringContaining('knowledge-keeper наведёт порядок в базе знаний /knowledge/') });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('knowledge-keeper наводит порядок в базе знаний.');
    expect(within(status).getByRole('link', { name: 'Открыть чат' })).toHaveAttribute('href', '/chat/t9');
    expect(screen.queryByRole('button', { name: 'Попросить knowledge-keeper навести порядок' })).toBeNull();

    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r1' }, 't9'));
    act(() => FakeEventSource.global().emit({ type: 'run.finished', runId: 'r1' }, 't9'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('knowledge-keeper закончил.'));
    expect(screen.getByRole('button', { name: 'Попросить knowledge-keeper навести порядок' })).toBeInTheDocument();
  });

  it('shows why the chat could not start', async () => {
    await openKnowledge('/knowledge', { 'POST /api/threads': () => errorResponse(409, 'Thread is busy with another run') });
    await userEvent.click(screen.getByRole('button', { name: 'Попросить knowledge-keeper навести порядок' }));
    expect(await screen.findByText('Thread is busy with another run')).toBeInTheDocument();
  });
});

describe('ConfirmDialog keyboard', () => {
  it('keeps focus inside and gives it back when closed', async () => {
    await openKnowledge('/knowledge?note=glossary.md', { 'DELETE /api/knowledge/note': undefined });
    const opener = await screen.findByRole('button', { name: 'Удалить' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('alertdialog');
    const [cancel, remove] = within(dialog).getAllByRole('button');
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(remove).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(remove).toHaveFocus();
    await userEvent.click(cancel!);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
