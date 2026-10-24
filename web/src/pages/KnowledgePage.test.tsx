import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';
import { knowledgeRoutes } from '../test-utils/knowledge-fixtures.ts';

async function openKnowledge(path = '/knowledge', routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...knowledgeRoutes, ...routes });
  window.history.pushState({}, '', path);
  render(<App />);
  await screen.findByRole('heading', { name: 'Что знает команда' });
  return api;
}

const noteList = () => screen.getByRole('complementary');
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  stubEventSource();
});

describe('Knowledge page: notes', () => {
  it('is in the top bar and lists notes by folder, with a filter', async () => {
    await openKnowledge();
    expect(screen.getByRole('link', { name: 'Знания' })).toHaveClass('topbar__link--active');
    expect(await within(noteList()).findByText('Верхний уровень')).toBeInTheDocument();
    expect(within(noteList()).getByText('how-to/')).toBeInTheDocument();
    expect(within(noteList()).getAllByRole('button', { name: /База знаний|Глоссарий|Как выкатить/ })).toHaveLength(3);
    expect(screen.getByText('Выберите заметку слева или создайте новую.')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Найти заметку' }), 'ВЫКАТ');
    expect(within(noteList()).getAllByRole('button', { name: /Как выкатить/ })).toHaveLength(1);
    expect(within(noteList()).queryByText('Глоссарий')).toBeNull();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Найти заметку' }), 'zzz');
    expect(screen.getByText('Ничего не нашлось.')).toBeInTheDocument();
  });

  it('shows a note as Markdown and follows links between notes', async () => {
    await openKnowledge();
    await userEvent.click(await within(noteList()).findByRole('button', { name: /Глоссарий/ }));
    expect(params().get('note')).toBe('glossary.md');

    const article = await screen.findByRole('article', { name: 'glossary.md' });
    expect(within(article).getByRole('heading', { level: 1, name: 'Глоссарий' })).toBeInTheDocument();
    expect(within(article).getByText('Заказ').tagName).toBe('STRONG');
    const link = within(article).getByRole('link', { name: 'как выкатить' });
    expect(link).toHaveAttribute('href', '/knowledge?note=how-to%2Fdeploy.md');

    await userEvent.click(link);
    expect(await screen.findByRole('article', { name: 'how-to/deploy.md' })).toHaveTextContent('Собрать.');
  });

  it('edits a note next to a live preview and saves it', async () => {
    const { callsTo } = await openKnowledge('/knowledge?note=glossary.md', { 'PUT /api/knowledge/note': { path: 'glossary.md', title: 'Глоссарий', size: 1, modifiedAt: '2026-10-24T11:00:00Z' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));

    const source = screen.getByRole('textbox', { name: 'Markdown' });
    expect(source).toHaveValue('# Глоссарий\n\n**Заказ** - строка в orders. См. [как выкатить](how-to/deploy.md).');
    await userEvent.clear(source);
    await userEvent.type(source, '# Словарь{enter}{enter}Новое _определение_');
    expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Словарь' })).toBeInTheDocument();
    expect(screen.getByText('определение').tagName).toBe('EM');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(callsTo('PUT', '/api/knowledge/note')[0]?.body).toEqual({ path: 'glossary.md', content: '# Словарь\n\nНовое _определение_' });
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Markdown' })).toBeNull();
  });

  it('saves with Ctrl+S and shows why saving failed', async () => {
    await openKnowledge('/knowledge?note=glossary.md', { 'PUT /api/knowledge/note': () => errorResponse(413, 'The note is larger than 256 KB') });
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Markdown' }), ' more{Control>}s{/Control}');
    expect(await screen.findByText('The note is larger than 256 KB')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toBeInTheDocument();
  });

  it('asks in the app before unsaved edits are lost, and leaves only when told to', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    await openKnowledge('/knowledge?note=glossary.md');
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Markdown' }), ' правка');

    await userEvent.click(within(noteList()).getByRole('button', { name: /Как выкатить/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Отменить несохранённые изменения?' });
    expect(within(dialog).getByRole('button', { name: 'Продолжить правку' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Продолжить правку' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Markdown' }) as HTMLTextAreaElement).value).toContain('правка');

    // Closing the tab gets the browser's prompt while the draft is unsaved.
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByRole('link', { name: 'Агенты' }));
    expect(window.location.pathname).toBe('/knowledge');
    await userEvent.click(screen.getByRole('button', { name: 'Не сохранять' }));
    await waitFor(() => expect(window.location.pathname).toBe('/agents'));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('switches notes without asking when nothing changed', async () => {
    await openKnowledge('/knowledge?note=glossary.md');
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    await userEvent.click(within(noteList()).getByRole('button', { name: /Как выкатить/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByRole('article', { name: 'how-to/deploy.md' })).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('creates a note in the folder of the open one', async () => {
    const { callsTo } = await openKnowledge('/knowledge?note=how-to%2Fdeploy.md', {
      'POST /api/knowledge/note': (body: unknown) => {
        const { path } = body as { path: string };
        return path === 'how-to/deploy.md' ? errorResponse(409, 'A note named "how-to/deploy.md" already exists') : { path, title: 'Откат', size: 1, modifiedAt: '2026-10-24T11:00:00Z' };
      },
    });
    await screen.findByRole('article', { name: 'how-to/deploy.md' });
    await userEvent.click(screen.getByRole('button', { name: 'Новая заметка' }));
    const path = screen.getByRole('textbox', { name: 'Путь' });
    expect(path).toHaveValue('how-to/');

    await userEvent.type(path, 'deploy');
    await userEvent.type(screen.getByRole('textbox', { name: 'Markdown' }), '# Откат');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('A note named "how-to/deploy.md" already exists')).toBeInTheDocument();

    await userEvent.clear(path);
    await userEvent.type(path, 'how-to/rollback');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(callsTo('POST', '/api/knowledge/note').at(-1)?.body).toEqual({ path: 'how-to/rollback.md', content: '# Откат' });
    await waitFor(() => expect(params().get('note')).toBe('how-to/rollback.md'));
  });

  it('deletes a note only after an in-app confirmation', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    const deleted: (string | null)[] = [];
    const { callsTo } = await openKnowledge('/knowledge?note=glossary.md', {
      'DELETE /api/knowledge/note': (_body: unknown, url: URL) => {
        deleted.push(url.searchParams.get('path'));
        return undefined;
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    let dialog = screen.getByRole('alertdialog', { name: 'Удалить заметку?' });
    expect(dialog).toHaveTextContent('«glossary.md» исчезнет для всей команды.');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(callsTo('DELETE', '/api/knowledge/note')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    dialog = screen.getByRole('alertdialog', { name: 'Удалить заметку?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(callsTo('DELETE', '/api/knowledge/note')).toHaveLength(1));
    expect(deleted).toEqual(['glossary.md']);
    await waitFor(() => expect(params().get('note')).toBeNull());
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('uploads .md and .txt files and explains what it refused', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const uploaded = { path: 'deploy-steps.md', title: 'Deploy steps', size: 30, modifiedAt: '2026-10-24T11:00:00Z' };
    const { callsTo } = await openKnowledge('/knowledge', {
      'POST /api/knowledge/upload': (body: unknown) =>
        (body as { name: string }).name === 'glossary.md' ? errorResponse(409, 'A note named "glossary.md" already exists') : uploaded,
      'GET /api/knowledge/note': { ...uploaded, content: '# Deploy steps\n\nBuild.\n' },
    });
    const files = [
      new File(['# Glossary'], 'glossary.md', { type: 'text/markdown' }),
      new File(['Build.'], 'Deploy steps.txt', { type: 'text/plain' }),
      new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }),
      new File(['x'.repeat(256 * 1024 + 1)], 'huge.md', { type: 'text/markdown' }),
    ];
    await user.upload(screen.getByLabelText('Загрузить', { selector: 'input' }), files);

    await waitFor(() => expect(callsTo('POST', '/api/knowledge/upload')).toHaveLength(2));
    expect(callsTo('POST', '/api/knowledge/upload')[1]?.body).toEqual({ name: 'Deploy steps.txt', content: 'Build.' });
    expect(await screen.findByText('glossary.md: A note named "glossary.md" already exists report.pdf не файл .md или .txt. huge.md больше 256 КБ.')).toBeInTheDocument();
    expect(params().get('note')).toBe('deploy-steps.md');
    expect(await screen.findByRole('article', { name: 'deploy-steps.md' })).toHaveTextContent('Build.');
    expect(screen.getByText('glossary.md: A note named "glossary.md" already exists report.pdf не файл .md или .txt. huge.md больше 256 КБ.')).toBeInTheDocument();
  });

  it('shows why the notes could not be loaded', async () => {
    await openKnowledge('/knowledge', { 'GET /api/knowledge': () => errorResponse(500, 'Internal error') });
    expect(await screen.findByText('Internal error')).toBeInTheDocument();
  });
});
