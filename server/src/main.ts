import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import { createAutoApprover } from './api/auto-approve.ts';
import { createEventBus } from './api/bus.ts';
import { allowedFor } from './api/guard.ts';
import { toChatHistory } from './api/history.ts';
import { createRunManager } from './api/runs.ts';
import { createServer } from './api/server.ts';
import { describeTeam } from './api/team-info.ts';
import { createThreadStore } from './api/threads.ts';
import { bootstrap } from './bootstrap.ts';
import { saveSettings } from './config/settings.ts';
import { kbagentVersion, listKeboolaProjects } from './system/keboola.ts';
import { listModels } from './system/models.ts';
import { systemStatus } from './system/status.ts';

interface StateReader {
  getState(config: { configurable: { thread_id: string } }): Promise<{ values: { messages?: BaseMessage[] } }>;
}

const app = bootstrap();
const { version } = JSON.parse(await readFile(join(app.env.rootDir, 'package.json'), 'utf8')) as { version: string };
const models = () => listModels(app.env.omniroute);
app.loadErrors.forEach((error) => console.warn(`[load] ${error.file}: ${error.message}`));

let settings = app.loadSettings();
let team = app.buildTeam(settings);
team.spec.warnings.forEach((warning) => console.warn(`[team] ${warning}`));

const bus = createEventBus({ historyPerThread: 5000 });
const threads = createThreadStore(join(app.env.dataDir, 'threads.json'));
const runs = createRunManager({
  bus,
  getGraph: () => team.graph,
  leadName: () => team.spec.lead.name,
  autoApprove: createAutoApprover({ isSqlAllowed: (threadId) => threads.policy(threadId)?.allowSql === true }),
});
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
      // Language, model and Keboola project all live in the agents prompts or tools: rebuild the team.
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
  models,
  keboolaProjects: () => listKeboolaProjects(),
  memory: () => readFile(join(app.env.dataDir, 'memories', 'AGENTS.md'), 'utf8').catch(() => ''),
  system: () => systemStatus({ version, models, kbagent: () => kbagentVersion(), model: team.effective.model }),
  effective: () => team.effective,
  version,
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
