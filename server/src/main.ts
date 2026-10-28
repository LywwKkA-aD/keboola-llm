import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import { createAutoApprover } from './api/auto-approve.ts';
import { createEventBus, SYSTEM_THREAD } from './api/bus.ts';
import { allowedFor } from './api/guard.ts';
import { toChatHistory } from './api/history.ts';
import { createPendingStore } from './api/pending-store.ts';
import {
  dropStaleApprovals,
  findUnfinishedRuns,
  hasUnfinishedRun,
  type InterruptReader,
  pendingInterruptIds,
  type ProgressReader,
} from './api/restore.ts';
import { createRunManager } from './api/runs.ts';
import { createServer } from './api/server.ts';
import { describeTeam } from './api/team-info.ts';
import { createThreadStore } from './api/threads.ts';
import { bootstrap } from './bootstrap.ts';
import { saveSettings } from './config/settings.ts';
import { createRoutines } from './routines/service.ts';
import { createNoteStore, MAX_MEMORY_BYTES } from './knowledge/store.ts';
import { watchFolders } from './runtime/watch.ts';
import { createSetupService } from './setup/service.ts';
import { kbagentConfigSource, kbagentVersion, keboolaAccess, listKeboolaProjects } from './system/keboola.ts';
import { accessSummary, type KeboolaAccess, shortAccess } from './system/keboola-access.ts';
import { listModels, modelsOfProvider } from './system/models.ts';
import { onboardingStatus } from './system/onboarding.ts';
import { previewPromotion } from './system/promotion.ts';
import { productionBranchOf, runnerFor } from './tools/kbagent/index.ts';
import { systemStatus } from './system/status.ts';
import { createDefinitionVersions } from './versions/tracker.ts';
import { createUsageStore, trackUsage } from './usage/store.ts';
import { createActivityLog } from './api/activity.ts';

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
const usage = createUsageStore({ file: join(app.env.dataDir, 'usage.json') });
const activity = createActivityLog(bus);
trackUsage(bus, usage);
// Runs a restart (or a failure before it) left midway: offered to continue, never resumed on their own.
const unfinished = await findUnfinishedRuns({
  threadIds: threads.list().map((thread) => thread.id),
  isUnfinished: (threadId) => hasUnfinishedRun(team.graph as unknown as ProgressReader, threadId),
});
if (unfinished.length > 0) console.log(`${unfinished.length} chat(s) stopped midway; they can be continued`);
const runs = createRunManager({
  bus,
  getGraph: () => team.graph,
  leadName: () => team.spec.lead.name,
  autoApprove: createAutoApprover({ isSqlAllowed: (threadId) => threads.policy(threadId)?.allowSql === true }),
  store: createPendingStore(join(app.env.dataDir, 'pending-approvals.json')),
  resumable: unfinished,
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
  if (event.type === 'run.failed') console.error(`[run] ${threadId}: ${event.reason}: ${event.error}`);
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
  // pollMs: a safety net for the changes a recursive watcher misses on Linux (watch.ts).
  { debounceMs: 400, pollMs: 2000 },
);

// Scheduled routines (routines/*.md) open chats on their own; they start once the server listens.
const routines = createRoutines({ rootDir: app.env.rootDir, dataDir: app.env.dataDir, threads, runs });

// What the analyst may do in Keboola (role, project features). Rebuild the team only when it changes what the agents
// are told or which tools they get; a failed read keeps the last known access.
const ACCESS_REFRESH_MS = 15 * 60_000;
let accessKey = '';
async function refreshAccess(): Promise<void> {
  let next: KeboolaAccess;
  try {
    next = await keboolaAccess(team.effective.keboolaProject || undefined);
  } catch (error) {
    console.warn(`[access] could not read the Keboola access: ${(error as Error).message}`);
    return;
  }
  const key = `${next.changePath}\n${accessSummary(next)}`;
  if (key === accessKey) return;
  accessKey = key;
  app.setKeboolaAccess(next);
  team = app.buildTeam(settings);
  console.log(`Keboola access: ${shortAccess(next)}`);
  bus.publish(SYSTEM_THREAD, { type: 'team.updated' });
}

const server = await createServer({
  bus,
  runs,
  threads,
  team: () =>
    describeTeam({ lead: team.spec.lead.name, agents: app.agents, skills: app.skills, warnings: team.spec.warnings, loadErrors: app.loadErrors }),
  settings: {
    get: () => settings,
    set: (patch) => {
      const project = settings.keboolaProject;
      settings = saveSettings(app.settingsFile, settings, patch);
      // Language, model and Keboola project all live in the agents prompts or tools: rebuild the team.
      team = app.buildTeam(settings);
      if (settings.keboolaProject !== project) void refreshAccess();
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
  system: () =>
    systemStatus({
      version,
      models: async () => modelsOfProvider(await models(), team.effective.model).map((model) => model.id),
      kbagent: () => kbagentVersion(),
      model: team.effective.model,
    }),
  effective: () => team.effective,
  onboarding: () =>
    onboardingStatus({ memoriesDir: join(app.env.dataDir, 'memories'), project: team.effective.keboolaProject, projects: () => listKeboolaProjects() }),
  version,
  versions,
  routines: routines.api,
  // The same folders the agents see as /knowledge/ and /memories/ (runtime/backend.ts).
  knowledge: createNoteStore(join(app.env.dataDir, 'knowledge')),
  memories: createNoteStore(join(app.env.dataDir, 'memories'), { maxBytes: MAX_MEMORY_BYTES }),
  usage: () => usage.report(),
  activity: () => activity.list(),
  promotionPreview: (query) => {
    const project = team.effective.keboolaProject || undefined;
    const options = { access: 'read' as const, ...(project ? { project } : {}) };
    const run = runnerFor(options);
    return previewPromotion({ run, production: productionBranchOf(run, options), ...(project ? { project } : {}), ...query });
  },
  setup: createSetupService({
    envFile: app.envFile,
    envTemplate: join(app.env.rootDir, '.env.example'),
    current: () => ({ omniroute: app.env.omniroute, ...team.effective }),
    kbagentVersion: () => kbagentVersion(),
    keboolaProjects: () => listKeboolaProjects(),
    keboolaAccess: () => keboolaAccess(team.effective.keboolaProject || undefined),
    kbagentConfig: () => kbagentConfigSource(),
    apply: (omniroute) => {
      // The key form in the setup wizard: new models for the next runs, no restart.
      app.setOmniRoute(omniroute);
      team = app.buildTeam(settings);
      console.log(`OmniRoute key saved to ${app.envFile} and in use`);
    },
  }),
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
// The analyst's access decides how changes reach production; read it now and again every quarter of an hour.
void refreshAccess();
setInterval(() => void refreshAccess(), ACCESS_REFRESH_MS).unref();
console.log(`Agent team: ${team.spec.lead.name} + ${team.spec.subagents.length} subagents`);
console.log(`Listening on http://${app.env.host}:${app.env.port}`);
routines.start();
