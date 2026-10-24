import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import { createAutoApprover } from './api/auto-approve.ts';
import { createEventBus, SYSTEM_THREAD } from './api/bus.ts';
import { allowedFor } from './api/guard.ts';
import { toChatHistory } from './api/history.ts';
import { createPendingStore } from './api/pending-store.ts';
import { dropStaleApprovals, type InterruptReader, pendingInterruptIds } from './api/restore.ts';
import { createRunManager } from './api/runs.ts';
import { createServer } from './api/server.ts';
import { describeTeam } from './api/team-info.ts';
import { createThreadStore } from './api/threads.ts';
import { bootstrap } from './bootstrap.ts';
import { saveSettings } from './config/settings.ts';
import { createRoutines } from './routines/service.ts';
import { watchFolders } from './runtime/watch.ts';
import { kbagentVersion, listKeboolaProjects } from './system/keboola.ts';
import { listModels } from './system/models.ts';
import { onboardingStatus } from './system/onboarding.ts';
import { systemStatus } from './system/status.ts';
import { createDefinitionVersions } from './versions/tracker.ts';

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
  store: createPendingStore(join(app.env.dataDir, 'pending-approvals.json')),
});
// Approvals pending before a restart come back from disk; keep only those the checkpointer still waits on.
const dropped = await dropStaleApprovals({
  runs,
  exists: (threadId) => threads.get(threadId) !== undefined,
  interruptIds: (threadId) => pendingInterruptIds(team.graph as unknown as InterruptReader, threadId),
});
dropped.forEach((threadId) => console.warn(`[approvals] dropped stale pending approvals of ${threadId}`));
if (runs.waitingThreads().length > 0) console.log(`Restored pending approvals in ${runs.waitingThreads().length} chat(s)`);
bus.subscribe(({ threadId, event }) => {
  if (event.type === 'run.finished' || event.type === 'run.waiting') threads.touch(threadId);
  if (event.type === 'run.failed') console.error(`[run] ${threadId}: ${event.error}`);
});

// Version history of agents/ and skills/ in the data dir: a baseline now, then whatever each reload finds changed.
const versions = createDefinitionVersions({ rootDir: app.env.rootDir, dir: join(app.env.dataDir, 'history') });
const syncVersions = (reason: 'start' | 'change') => {
  try {
    const recorded = versions.sync(reason);
    if (reason === 'change') recorded.forEach(({ kind, name, change }) => console.log(`[history] ${kind}/${name}: ${change}`));
  } catch (error) {
    console.error(`[history] could not record versions: ${(error as Error).message}`);
  }
};
syncVersions('start');

// agent-builder (or the user) edits agents/ and skills/ on disk: rebuild the team and tell the UI.
const stopWatching = watchFolders(
  [join(app.env.rootDir, 'agents'), join(app.env.rootDir, 'skills')],
  () => {
    syncVersions('change');
    app.reloadDefinitions();
    try {
      team = app.buildTeam(settings);
    } catch (error) {
      // A half-written or broken definition must not take the server down: keep the running team.
      console.error(`[team] reload failed, keeping the previous team: ${(error as Error).message}`);
      return;
    }
    app.loadErrors.forEach((error) => console.warn(`[load] ${error.file}: ${error.message}`));
    team.spec.warnings.forEach((warning) => console.warn(`[team] ${warning}`));
    console.log(`Agent team reloaded: ${team.spec.lead.name} + ${team.spec.subagents.length} subagents`);
    bus.publish(SYSTEM_THREAD, { type: 'team.updated' });
  },
  { debounceMs: 400 },
);

// Scheduled routines (routines/*.md) open chats on their own; they start once the server listens.
const routines = createRoutines({ rootDir: app.env.rootDir, dataDir: app.env.dataDir, threads, runs });

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
  onboarding: () =>
    onboardingStatus({ memoriesDir: join(app.env.dataDir, 'memories'), project: team.effective.keboolaProject, projects: () => listKeboolaProjects() }),
  version,
  versions,
  routines: routines.api,
});

const shutdown = async () => {
  stopWatching();
  routines.stop();
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.listen({ host: app.env.host, port: app.env.port });
console.log(`Agent team: ${team.spec.lead.name} + ${team.spec.subagents.length} subagents`);
console.log(`Listening on http://${app.env.host}:${app.env.port}`);
routines.start();
