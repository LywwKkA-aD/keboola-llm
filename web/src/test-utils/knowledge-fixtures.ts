import type { Note } from '../api/knowledge.ts';
import { errorResponse } from './fake-api.ts';

const at = '2026-10-24T10:00:00Z';
const note = (path: string, title: string, content: string): Note => ({ path, title, size: content.length, modifiedAt: at, content });

export const NOTES: readonly Note[] = [
  note('README.md', 'База знаний', '# База знаний\n\nЗаметки команды.'),
  note('glossary.md', 'Глоссарий', '# Глоссарий\n\n**Заказ** - строка в orders. См. [как выкатить](how-to/deploy.md).'),
  note('how-to/deploy.md', 'Как выкатить', '# Как выкатить\n\n1. Собрать.\n2. Выкатить.'),
];

const summaries = NOTES.map(({ content: _content, ...summary }) => summary);

export const PROFILE: Note = note('sandbox.md', 'Проект sandbox', '# Проект sandbox\n\nБэкенд BigQuery, 12 бакетов.');

/** Routes the Knowledge page reads; tests spread their own on top. */
export const knowledgeRoutes = {
  'GET /api/knowledge': { notes: summaries },
  'GET /api/knowledge/note': (_body: unknown, url: URL) =>
    NOTES.find((entry) => entry.path === url.searchParams.get('path')) ?? errorResponse(404, 'Note not found'),
  'GET /api/memory': { content: '# Общая память\n\n- Бэкенд BigQuery', modifiedAt: at },
  'GET /api/memory/projects': { profiles: [{ path: PROFILE.path, title: PROFILE.title, size: PROFILE.size, modifiedAt: at }] },
  'GET /api/memory/projects/sandbox.md': PROFILE,
};
