import type { FastifyInstance } from 'fastify';
import { isNoteError, noteError } from '../../knowledge/errors.ts';
import { cleanText } from '../../knowledge/markdown.ts';
import type { NoteSummary } from '../../knowledge/store.ts';
import { memoryBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

/** Inside the memories folder; the agents see them as /memories/AGENTS.md and /memories/projects/. */
const MEMORY_FILE = 'AGENTS.md';
const PROFILES = 'projects/';

const asProfile = <T extends NoteSummary>(note: T): T => ({ ...note, path: note.path.slice(PROFILES.length) });

/** The shared memory the lead reads before every run (editable), and project-scout's profiles (read-only). */
export function registerMemoryRoutes(app: FastifyInstance, { memories }: Pick<ServerDeps, 'memories'>): void {
  app.get('/api/memory', async () => {
    try {
      const { content, modifiedAt } = await memories.read(MEMORY_FILE);
      return { content, modifiedAt };
    } catch (error) {
      if (isNoteError(error, 'NOTE_NOT_FOUND')) return { content: '' };
      throw error;
    }
  });

  app.put('/api/memory', async (request) => {
    const content = cleanText(memoryBody.parse(request.body).content);
    const { modifiedAt } = await memories.write(MEMORY_FILE, content);
    return { content, modifiedAt };
  });

  app.get('/api/memory/projects', async () => ({
    profiles: (await memories.list())
      .filter((note) => note.path.startsWith(PROFILES) && !note.path.slice(PROFILES.length).includes('/'))
      .map(asProfile),
  }));

  app.get<{ Params: { file: string } }>('/api/memory/projects/:file', async (request) => {
    const { file } = request.params;
    if (file.includes('/')) throw noteError('NOTE_INVALID', 'Invalid path: a profile is a file in projects/');
    return asProfile(await memories.read(`${PROFILES}${file}`));
  });
}
