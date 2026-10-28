/**
 * What the team may do in the analyst's Keboola project, from her role and the project's features. The app
 * cannot know her company's setup in advance, so it reads it (read-only kbagent calls) and picks the way changes
 * reach production: a promotion in the app, a merge request, the Keboola UI, or no changes at all.
 */
import { describeFailure, type RunResult } from '../tools/kbagent/runner.ts';

/** How a verified change on a development branch gets to production. */
export type ChangePath = 'promote' | 'merge-request' | 'keboola-ui' | 'read-only';

export interface KeboolaAccess {
  readonly project: string;
  readonly backend?: string;
  /** Project role of the signed-in user (session sign-in only): admin, share, guest, readOnly, developer, reviewer, productionManager. */
  readonly role?: string;
  readonly authMode?: string;
  readonly masterToken?: boolean;
  /** kbagent session state: live, refreshed, degraded, expired, missing. */
  readonly session?: string;
  readonly mergeRequests: boolean;
  /** SOX-style protected production (feature protected-default-branch): changes only through the Keboola UI. */
  readonly protectedProduction: boolean;
  readonly changePath: ChangePath;
  /** SQL workspaces (create, load, query) are allowed for the role. */
  readonly sql: boolean;
}

interface ProjectInfo {
  readonly alias?: unknown;
  readonly project_id?: unknown;
  readonly default_backend?: unknown;
  readonly auth_mode?: unknown;
  readonly features?: unknown;
  readonly is_master_token?: unknown;
}

interface AuthStatus {
  readonly status?: unknown;
  readonly accessible_projects?: unknown;
}

const BRANCH_ONLY_ROLES = new Set(['developer', 'reviewer']);

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

function roleIn(auth: AuthStatus | undefined, projectId: unknown): string | undefined {
  const projects = Array.isArray(auth?.accessible_projects) ? (auth.accessible_projects as { id?: unknown; role?: unknown }[]) : [];
  return text(projects.find((entry) => String(entry.id) === String(projectId))?.role);
}

function changePathFor(role: string | undefined, protectedProduction: boolean, mergeRequests: boolean): ChangePath {
  const lower = role?.toLowerCase();
  if (lower === 'readonly') return 'read-only';
  if (protectedProduction || lower === 'productionmanager') return 'keboola-ui';
  if (lower && BRANCH_ONLY_ROLES.has(lower)) return mergeRequests ? 'merge-request' : 'keboola-ui';
  return 'promote';
}

/** Pure: the access from `project info` and, for a session sign-in, `auth status`. */
export function deriveAccess({ info, auth }: { info: ProjectInfo; auth?: AuthStatus }): KeboolaAccess {
  const features = Array.isArray(info.features) ? info.features.map(String) : [];
  const mergeRequests = features.includes('branches-merge-requests');
  const protectedProduction = features.includes('protected-default-branch');
  const role = roleIn(auth, info.project_id);
  const changePath = changePathFor(role, protectedProduction, mergeRequests);
  const backend = text(info.default_backend);
  const authMode = text(info.auth_mode);
  const session = text(auth?.status);
  return {
    project: text(info.alias) ?? '',
    ...(backend ? { backend } : {}),
    ...(role ? { role } : {}),
    ...(authMode ? { authMode } : {}),
    ...(typeof info.is_master_token === 'boolean' ? { masterToken: info.is_master_token } : {}),
    ...(session ? { session } : {}),
    mergeRequests,
    protectedProduction,
    changePath,
    sql: changePath !== 'read-only',
  };
}

const BACKENDS: Readonly<Record<string, string>> = { snowflake: 'Snowflake', bigquery: 'BigQuery' };

const PATHS: Readonly<Record<ChangePath, string>> = {
  promote: 'change on a development branch, verify there, then kbagent_promote; the user approves the promotion in the app',
  'merge-request':
    'change on a development branch, verify there, then open a merge request in Keboola; a reviewer approves and a production manager merges it there (kbagent_promote is not available)',
  'keboola-ui':
    'change on a development branch and verify there; the user merges it to production in the Keboola UI (Merge to production), the app cannot (kbagent_promote is not available)',
  'read-only': 'read-only: search, explain and review; no changes, no SQL workspaces, no jobs. Say so when a task needs more',
};

/** A few lines for the agents' system prompts. */
export function accessSummary(access: KeboolaAccess): string {
  const who = access.role ? `role ${access.role}` : access.masterToken === false ? 'a limited Storage token (its permissions are not known)' : 'a Storage token';
  return [
    `- Project ${access.project}, ${BACKENDS[access.backend ?? ''] ?? access.backend ?? 'unknown'} backend; the analyst works with ${who}.`,
    `- Changes: ${PATHS[access.changePath]}.`,
    ...(access.protectedProduction ? ['- Production is protected in this project: nothing in it is changed directly.'] : []),
  ].join('\n');
}

const SHORT_PATHS: Readonly<Record<ChangePath, string>> = {
  promote: 'promotion in the app',
  'merge-request': 'merge requests',
  'keboola-ui': 'merge in the Keboola UI',
  'read-only': 'read-only',
};

/** One line for the setup checklist. */
export function shortAccess(access: KeboolaAccess): string {
  return [access.role ?? (access.authMode === 'token' ? 'token' : undefined), access.backend, `changes: ${SHORT_PATHS[access.changePath]}`]
    .filter(Boolean)
    .join(' · ');
}

const dataOf = <T>(result: RunResult): T | undefined => (result.ok ? (result.output as { data?: T } | undefined)?.data : undefined);

/** Read the access with kbagent (read-only calls only). */
export async function readKeboolaAccess({ run, project }: { run: (argv: readonly string[]) => Promise<RunResult>; project?: string }): Promise<KeboolaAccess> {
  const argv = ['--json', '--deny-writes', 'project', 'info', ...(project ? ['--project', project] : [])];
  const result = await run(argv);
  const info = dataOf<ProjectInfo>(result);
  if (!info) throw new Error(`kbagent could not read the project (kbagent ${argv.slice(2).join(' ')}, exit ${String(result.exitCode)}): ${describeFailure(result)}`);
  const auth = info.auth_mode === 'session' ? dataOf<AuthStatus>(await run(['--json', '--deny-writes', 'auth', 'status'])) : undefined;
  return deriveAccess({ info, ...(auth ? { auth } : {}) });
}
