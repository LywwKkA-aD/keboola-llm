/**
 * The first-run checklist, shared by the setup wizard (GET /api/setup) and `npm run doctor`. Each step
 * says ok, fail (with a reason the UI explains and offers a fix for) or blocked by an earlier step.
 * Details are short English facts for the terminal; they never carry the OmniRoute key.
 */
import type { OmniRouteConfig } from '../config/env.ts';
import { type KeboolaAccess, shortAccess } from '../system/keboola-access.ts';
import type { KeboolaProject } from '../system/keboola.ts';
import { type ModelTestResult, type OmniRouteProbe, redactSecret } from './omniroute.ts';

export type SetupStepId = 'omniroute' | 'apiKey' | 'model' | 'kbagent' | 'projects' | 'project' | 'access';
export type SetupStatus = 'ok' | 'fail' | 'blocked';
export type SetupReason =
  | 'unreachable'
  | 'http'
  | 'keyMissing'
  | 'keyRejected'
  | 'modelMissing'
  | 'modelFailed'
  | 'kbagentMissing'
  | 'projectsNone'
  | 'projectsFailed'
  | 'projectMissing'
  | 'projectUnknown'
  | 'sessionExpired'
  | 'accessUnreadable';

export interface SetupStep {
  readonly id: SetupStepId;
  readonly status: SetupStatus;
  readonly reason?: SetupReason;
  readonly detail: string;
}

export interface SetupInput {
  /** OmniRoute settings with the model in use (settings override .env). */
  readonly omniroute: OmniRouteConfig;
  /** The configured Keboola project alias; empty means kbagent's default. */
  readonly keboolaProject: string;
  readonly probeOmniRoute: () => Promise<OmniRouteProbe>;
  readonly testModel: () => Promise<ModelTestResult>;
  readonly kbagentVersion: () => Promise<string>;
  readonly keboolaProjects: () => Promise<readonly KeboolaProject[]>;
  /** What the analyst may do in the project; without it the checklist has no access step (e.g. doctor). */
  readonly keboolaAccess?: () => Promise<KeboolaAccess>;
}

export interface SetupChecks {
  readonly steps: readonly SetupStep[];
  /** Every step is ok: the team can work and Home may offer the project survey. */
  readonly complete: boolean;
  /** What the wizard offers to choose from; empty when the step before failed. */
  readonly models: readonly string[];
  readonly projects: readonly KeboolaProject[];
}

/** Step names for the terminal (`npm run doctor`). */
export const STEP_LABELS: Readonly<Record<SetupStepId, string>> = {
  omniroute: 'OmniRoute',
  apiKey: 'OmniRoute key',
  model: 'Model',
  kbagent: 'kbagent',
  projects: 'Keboola projects',
  project: 'Keboola project',
  access: 'Keboola access',
};

const EXPIRED_SESSIONS = new Set(['expired', 'missing']);

/** Read only once the project is known: an expired sign-in fails here, the rest says what changes are possible. */
async function accessStep(project: SetupStep, read: () => Promise<KeboolaAccess>): Promise<SetupStep> {
  if (project.status !== 'ok') return blocked('access', 'waiting for a project');
  const access = await settle(read());
  if (access.status === 'rejected') return fail('access', 'accessUnreadable', message(access.reason));
  const { session } = access.value;
  if (session && EXPIRED_SESSIONS.has(session)) return fail('access', 'sessionExpired', `kbagent session ${session}`);
  return ok('access', shortAccess(access.value));
}

const AUTH_STATUSES = new Set([401, 403]);

const ok = (id: SetupStepId, detail: string): SetupStep => ({ id, status: 'ok', detail });
const fail = (id: SetupStepId, reason: SetupReason, detail: string): SetupStep => ({ id, status: 'fail', reason, detail });
const blocked = (id: SetupStepId, detail: string): SetupStep => ({ id, status: 'blocked', detail });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const settle = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );

function omniRouteSteps({ baseUrl, apiKey }: OmniRouteConfig, probe: OmniRouteProbe): [SetupStep, SetupStep] {
  if (!probe.reachable) {
    return [fail('omniroute', 'unreachable', `not reachable at ${baseUrl}${probe.error ? ` (${probe.error})` : ''}`), blocked('apiKey', 'waiting for OmniRoute')];
  }
  const status = probe.status ?? 0;
  const denied = AUTH_STATUSES.has(status);
  if (!denied && (status < 200 || status >= 300)) {
    return [fail('omniroute', 'http', `${baseUrl}/models answered HTTP ${status}`), blocked('apiKey', 'waiting for OmniRoute')];
  }
  const count = probe.models?.length ?? 0;
  const router = ok('omniroute', denied ? `running at ${baseUrl}` : `${count} model${count === 1 ? '' : 's'} at ${baseUrl}`);
  if (!apiKey) return [router, fail('apiKey', 'keyMissing', 'not set')];
  return [router, denied ? fail('apiKey', 'keyRejected', `rejected by OmniRoute (HTTP ${status})`) : ok('apiKey', 'set and accepted')];
}

async function modelStep(input: SetupInput, ready: boolean): Promise<SetupStep> {
  const { model } = input.omniroute;
  if (!ready) return blocked('model', 'waiting for OmniRoute and its key');
  if (!model) return fail('model', 'modelMissing', 'not chosen');
  const result = await input.testModel();
  return result.ok ? ok('model', `${model} answered in ${result.latencyMs} ms`) : fail('model', 'modelFailed', `${model}: ${result.error ?? 'no answer'}`);
}

function projectStep(configured: string, projects: readonly KeboolaProject[]): SetupStep {
  if (configured) {
    return projects.some((entry) => entry.alias === configured)
      ? ok('project', configured)
      : fail('project', 'projectUnknown', `${configured} is not registered in kbagent`);
  }
  const fallback = projects.find((entry) => entry.isDefault);
  if (fallback) return ok('project', `${fallback.alias} (kbagent default)`);
  const [only] = projects;
  return only && projects.length === 1 ? ok('project', `${only.alias} (the only one)`) : fail('project', 'projectMissing', 'not chosen');
}

function keboolaSteps(version: PromiseSettledResult<string>, listed: PromiseSettledResult<readonly KeboolaProject[]>, configured: string): SetupStep[] {
  if (version.status === 'rejected') {
    return [fail('kbagent', 'kbagentMissing', message(version.reason)), blocked('projects', 'waiting for kbagent'), blocked('project', 'waiting for kbagent')];
  }
  const tool = ok('kbagent', version.value);
  if (listed.status === 'rejected') return [tool, fail('projects', 'projectsFailed', message(listed.reason)), blocked('project', 'waiting for a project')];
  const projects = listed.value;
  if (projects.length === 0) return [tool, fail('projects', 'projectsNone', 'none registered'), blocked('project', 'waiting for a project')];
  const aliases = projects.map((entry) => entry.alias).join(', ');
  return [tool, ok('projects', `${projects.length} registered: ${aliases}`), projectStep(configured, projects)];
}

/** Run every check; OmniRoute and kbagent are asked in parallel, the model only once its key works. */
export async function runSetupChecks(input: SetupInput): Promise<SetupChecks> {
  const [probe, version, listed] = await Promise.all([input.probeOmniRoute(), settle(input.kbagentVersion()), settle(input.keboolaProjects())]);
  const [router, key] = omniRouteSteps(input.omniroute, probe);
  const model = await modelStep(input, router.status === 'ok' && key.status === 'ok');
  const keboola = keboolaSteps(version, listed, input.keboolaProject);
  const project = keboola.at(-1) as SetupStep;
  const access = input.keboolaAccess ? [await accessStep(project, input.keboolaAccess)] : [];
  const steps = [router, key, model, ...keboola, ...access].map((entry) => ({
    ...entry,
    detail: redactSecret(entry.detail, input.omniroute.apiKey),
  }));
  return {
    steps,
    complete: steps.every((entry) => entry.status === 'ok'),
    models: key.status === 'ok' ? (probe.models ?? []) : [],
    projects: listed.status === 'fulfilled' && version.status === 'fulfilled' ? listed.value : [],
  };
}
