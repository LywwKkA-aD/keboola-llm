import { join } from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import { createEventBus } from './api/bus.ts';
import { allowedFor } from './api/guard.ts';
import { toChatHistory } from './api/history.ts';
import { createRunManager } from './api/runs.ts';
import { createServer } from './api/server.ts';
import { describeTeam } from './api/team-info.ts';
import { createThreadStore } from './api/threads.ts';
import { bootstrap } from './bootstrap.ts';
import { saveSettings } from './config/settings.ts';

interface StateReader {
  getState(config: { configurable: { thread_id: string } }): Promise<{ values: { messages?: BaseMessage[] } }>;
}

const app = bootstrap();
app.loadErrors.forEach((error) => console.warn(`[load] ${error.file}: ${error.message}`));

let settings = app.loadSettings();
let team = app.buildTeam(settings);
team.spec.warnings.forEach((warning) => console.warn(`[team] ${warning}`));

const bus = createEventBus({ historyPerThread: 5000 });
const threads = createThreadStore(join(app.env.dataDir, 'threads.json'));
const runs = createRunManager({ bus, getGraph: () => team.graph, leadName: () => team.spec.lead.name });
bus.subscribe(({ threadId, event }) => {
  if (event.type === 'run.finished' || event.type === 'run.waiting') threads.touch(threadId);
  if (event.type === 'run.failed') console.error(`[run] ${threadId}: ${event.error}`);
});

const server = await createServer({
  bus,
  runs,
  threads,
  team: () =>
    describeTeam({ lead: team.spec.lead.name, agents: app.agents, skills: app.skills, warnings: team.spec.warnings, loadErrors: app.loadErrors }),
  settings: {
    get: () => settings,
    set: (patch) => {
      settings = saveSettings(app.settingsFile, settings, patch);
      team = app.buildTeam(settings);
      return settings;
    },
  },
  history: async (threadId) => {
    // createDeepAgent's inferred graph type collapses getState() to never; read through a narrow view.
    const graph = team.graph as unknown as StateReader;
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    return toChatHistory(state.values.messages);
  },
  deleteThread: (threadId) => app.checkpointer.deleteThread(threadId),
  allowed: allowedFor({ port: app.env.port, devPort: app.env.webDevPort }),
  staticDir: join(app.env.rootDir, 'web', 'dist'),
});

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.listen({ host: app.env.host, port: app.env.port });
console.log(`Agent team: ${team.spec.lead.name} + ${team.spec.subagents.length} subagents`);
console.log(`Listening on http://${app.env.host}:${app.env.port}`);
