import type { FastifyInstance } from 'fastify';
import { cleanText, textToMarkdown } from '../../knowledge/markdown.ts';
import { uploadPath, uploadTitle } from '../../knowledge/note-path.ts';
import { noteBody, notePathQuery, uploadBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

/** The knowledge base the agents see as /knowledge/: list, read, write, delete and upload Markdown notes. */
export function registerKnowledgeRoutes(app: FastifyInstance, { knowledge }: Pick<ServerDeps, 'knowledge'>): void {
  app.get('/api/knowledge', async () => ({ notes: await knowledge.list() }));

  app.get('/api/knowledge/note', async (request) => knowledge.read(notePathQuery.parse(request.query).path));

  // Create only: a new note never replaces one with the same path.
  app.post('/api/knowledge/note', async (request, reply) => {
    const { path, content } = noteBody.parse(request.body);
    return reply.code(201).send(await knowledge.write(path, cleanText(content), { create: true }));
  });

  app.put('/api/knowledge/note', async (request) => {
    const { path, content } = noteBody.parse(request.body);
    return knowledge.write(path, cleanText(content));
  });

  app.delete('/api/knowledge/note', async (request, reply) => {
    await knowledge.remove(notePathQuery.parse(request.query).path);
    return reply.code(204).send();
  });

  // The browser reads the file as text and sends it as JSON: no multipart parser, the same size checks.
  app.post('/api/knowledge/upload', async (request, reply) => {
    const { name, content, folder } = uploadBody.parse(request.body);
    const path = uploadPath(name, folder);
    const markdown = /\.txt$/i.test(name) ? textToMarkdown(uploadTitle(name), content) : cleanText(content);
    return reply.code(201).send(await knowledge.write(path, markdown, { create: true }));
  });
}
