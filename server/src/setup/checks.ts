/**
 * The first-run checklist, shared by the setup wizard (GET /api/setup) and `npm run doctor`. Each step
 * says ok, fail (with a reason the UI explains and offers a fix for) or blocked by an earlier step.
 * `detail` is a short English line for the terminal; `facts` say the same as data, for the UI to word in the
 * user's language. Neither ever carries the OmniRoute key.
 */
import type { OmniRouteConfig } from '../config/env.ts';
import { type ChangePath, type KeboolaAccess, shortAccess } from '../system/keboola-access.ts';
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

/** What a step found, as data. `none`: nothing to add to the reason (a key or a choice is missing). */
export type SetupFacts =
  | { readonly kind: 'none' }
  | { readonly kind: 'router'; readonly url: string; readonly models?: number }
  | { readonly kind: 'unreachable'; readonly url: string; readonly error?: string }
  | { readonly kind: 'http'; readonly url: string; readonly status: number }
  | { readonly kind: 'keyAccepted' }
  | { readonly kind: 'keyRejected'; readonly status: number }
  | { readonly kind: 'modelAnswered'; readonly model: string; readonly ms: number }
  | { readonly kind: 'modelFailed'; readonly model: string; readonly error: string }
  | { readonly kind: 'version'; readonly version: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'projects'; readonly aliases: readonly string[] }
  | { readonly kind: 'project'; readonly alias: string; readonly source: 'configured' | 'default' | 'only' }
  | { readonly kind: 'projectUnknown'; readonly alias: string }
  | {
      readonly kind: 'access';
      readonly role?: string;
      /** Signed in with a Storage token, which has no project role. */
      readonly token?: true;
      readonly backend?: string;
      readonly changePath: ChangePath;
      readonly protectedProduction: boolean;
    }
  | { readonly kind: 'session'; readonly session: string };

export interface SetupStep {
  readonly id: SetupStepId;
  readonly status: SetupStatus;
  readonly reason?: SetupReason;
  readonly detail: string;
  /** Absent on blocked steps: they only wait for an earlier one. */
  readonly facts?: SetupFacts;
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
const AUTH_STATUSES = new Set([401, 403]);
const NONE: SetupFacts = { kind: 'none' };

const ok = (id: SetupStepId, detail: string, facts: SetupFacts): SetupStep => ({ id, status: 'ok', detail, facts });
const fail = (id: SetupStepId, reason: SetupReason, detail: string, facts: SetupFacts): SetupStep => ({ id, status: 'fail', reason, detail, facts });
const blocked = (id: SetupStepId, detail: string): SetupStep => ({ id, status: 'blocked', detail });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** A step that failed with an error: its message is both the detail and the fact. */
const failed = (id: SetupStepId, reason: SetupReason, error: unknown) => fail(id, reason, message(error), { kind: 'error', message: message(error) });
const settle = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );

/** Read only once the project is known: an expired sign-in fails here, the rest says what changes are possible. */
async function accessStep(project: SetupStep, read: () => Promise<KeboolaAccess>): Promise<SetupStep> {
  if (project.status !== 'ok') return blocked('access', 'waiting for a project');
  const access = await settle(read());
  if (access.status === 'rejected') return failed('access', 'accessUnreadable', access.reason);
  const { session, role, authMode, backend, changePath, protectedProduction } = access.value;
  if (session && EXPIRED_SESSIONS.has(session)) return fail('access', 'sessionExpired', `kbagent session ${session}`, { kind: 'session', session });
  return ok('access', shortAccess(access.value), {
    kind: 'access',
    ...(role ? { role } : authMode === 'token' ? { token: true as const } : {}),
    ...(backend ? { backend } : {}),
    changePath,
    protectedProduction,
  });
}

function omniRouteSteps({ baseUrl, apiKey }: OmniRouteConfig, probe: OmniRouteProbe): [SetupStep, SetupStep] {
  if (!probe.reachable) {
    const unreachable = fail('omniroute', 'unreachable', `not reachable at ${baseUrl}${probe.error ? ` (${probe.error})` : ''}`, {
      kind: 'unreachable',
      url: baseUrl,
      ...(probe.error ? { error: probe.error } : {}),
    });
    return [unreachable, blocked('apiKey', 'waiting for OmniRoute')];
  }
  const status = probe.status ?? 0;
  const denied = AUTH_STATUSES.has(status);
  if (!denied && (status < 200 || status >= 300)) {
    const url = `${baseUrl}/models`;
    return [fail('omniroute', 'http', `${url} answered HTTP ${status}`, { kind: 'http', url, status }), blocked('apiKey', 'waiting for OmniRoute')];
  }
  const count = probe.models?.length ?? 0;
  const router = denied
    ? ok('omniroute', `running at ${baseUrl}`, { kind: 'router', url: baseUrl })
    : ok('omniroute', `${count} model${count === 1 ? '' : 's'} at ${baseUrl}`, { kind: 'router', url: baseUrl, models: count });
  if (!apiKey) return [router, fail('apiKey', 'keyMissing', 'not set', NONE)];
  const key = denied
    ? fail('apiKey', 'keyRejected', `rejected by OmniRoute (HTTP ${status})`, { kind: 'keyRejected', status })
    : ok('apiKey', 'set and accepted', { kind: 'keyAccepted' });
  return [router, key];
}

async function modelStep(input: SetupInput, ready: boolean): Promise<SetupStep> {
  const { model } = input.omniroute;
  if (!ready) return blocked('model', 'waiting for OmniRoute and its key');
  if (!model) return fail('model', 'modelMissing', 'not chosen', NONE);
  const result = await input.testModel();
  if (result.ok) return ok('model', `${model} answered in ${result.latencyMs} ms`, { kind: 'modelAnswered', model, ms: result.latencyMs });
  const error = result.error ?? 'no answer';
  return fail('model', 'modelFailed', `${model}: ${error}`, { kind: 'modelFailed', model, error });
}

function projectStep(configured: string, projects: readonly KeboolaProject[]): SetupStep {
  if (configured) {
    return projects.some((entry) => entry.alias === configured)
      ? ok('project', configured, { kind: 'project', alias: configured, source: 'configured' })
      : fail('project', 'projectUnknown', `${configured} is not registered in kbagent`, { kind: 'projectUnknown', alias: configured });
  }
  const fallback = projects.find((entry) => entry.isDefault);
  if (fallback) return ok('project', `${fallback.alias} (kbagent default)`, { kind: 'project', alias: fallback.alias, source: 'default' });
  const [only] = projects;
  return only && projects.length === 1
    ? ok('project', `${only.alias} (the only one)`, { kind: 'project', alias: only.alias, source: 'only' })
    : fail('project', 'projectMissing', 'not chosen', NONE);
}

function keboolaSteps(version: PromiseSettledResult<string>, listed: PromiseSettledResult<readonly KeboolaProject[]>, configured: string): SetupStep[] {
  if (version.status === 'rejected') {
    return [failed('kbagent', 'kbagentMissing', version.reason), blocked('projects', 'waiting for kbagent'), blocked('project', 'waiting for kbagent')];
  }
  const tool = ok('kbagent', version.value, { kind: 'version', version: version.value });
  if (listed.status === 'rejected') return [tool, failed('projects', 'projectsFailed', listed.reason), blocked('project', 'waiting for a project')];
  const projects = listed.value;
  if (projects.length === 0) return [tool, fail('projects', 'projectsNone', 'none registered', NONE), blocked('project', 'waiting for a project')];
  const aliases = projects.map((entry) => entry.alias);
  return [tool, ok('projects', `${projects.length} registered: ${aliases.join(', ')}`, { kind: 'projects', aliases }), projectStep(configured, projects)];
}

/** The facts with every text field redacted: an error message may quote what a tool received. */
function redactFacts(facts: SetupFacts, redact: (text: string) => string): SetupFacts {
  return Object.fromEntries(Object.entries(facts).map(([name, value]) => [name, typeof value === 'string' && name !== 'kind' ? redact(value) : value])) as SetupFacts;
}

/** Run every check; OmniRoute and kbagent are asked in parallel, the model only once its key works. */
export async function runSetupChecks(input: SetupInput): Promise<SetupChecks> {
  const [probe, version, listed] = await Promise.all([input.probeOmniRoute(), settle(input.kbagentVersion()), settle(input.keboolaProjects())]);
  const [router, key] = omniRouteSteps(input.omniroute, probe);
  const model = await modelStep(input, router.status === 'ok' && key.status === 'ok');
  const keboola = keboolaSteps(version, listed, input.keboolaProject);
  const project = keboola.at(-1) as SetupStep;
  const access = input.keboolaAccess ? [await accessStep(project, input.keboolaAccess)] : [];
  const redact = (text: string) => redactSecret(text, input.omniroute.apiKey);
  const steps = [router, key, model, ...keboola, ...access].map((entry) => ({
    ...entry,
    detail: redact(entry.detail),
    ...(entry.facts ? { facts: redactFacts(entry.facts, redact) } : {}),
  }));
  return {
    steps,
    complete: steps.every((entry) => entry.status === 'ok'),
    models: key.status === 'ok' ? (probe.models ?? []) : [],
    projects: listed.status === 'fulfilled' && version.status === 'fulfilled' ? listed.value : [],
  };
}
