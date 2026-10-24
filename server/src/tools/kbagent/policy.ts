/**
 * Turn agent-supplied kbagent arguments into a safe argv, or explain why not.
 * Pure: no I/O. kbagent's own firewall (--deny-writes / --deny-destructive) is the
 * second line of defense; these rules add what the firewall does not cover
 * (credentials, local disk, admin ops, project and branch pinning).
 */
import { categorize, isKnownGroup, lookupOperation } from './catalog.ts';
import type { OperationInfo } from './catalog.ts';
import {
  BRANCH_AGNOSTIC_WRITES,
  CROSS_PROJECT_FLAGS,
  DENIED_GROUPS,
  DENIED_OPERATIONS,
  DROPPED_FLAGS,
  FORBIDDEN_FLAG_PREFIXES,
  FORBIDDEN_FLAGS,
} from './rules.ts';
import type { Access, Category, InvocationResult } from './types.ts';

export interface InvocationRequest {
  readonly args: readonly string[];
  readonly access: Access;
  /** kbagent project alias the tool is pinned to. */
  readonly project?: string;
  /** Keboola dev branch id the tool is pinned to. */
  readonly branch?: string | number;
  /** Id of the project's production (default) branch; without a pinned branch, writes must avoid it. */
  readonly productionBranch?: string;
  /** Sent as X-Conversation-ID for Keboola-side observability. */
  readonly conversationId?: string;
  /** When set, only these operations (e.g. "workspace.query") are allowed, on top of every other rule. */
  readonly operations?: ReadonlySet<string>;
}

const LONG_FLAG = /^--[a-z0-9][a-z0-9-]*(=[\s\S]*)?$/;
const SHORT_FLAG = /^-[A-Za-z]\S*$/;
const COMMAND_WORD = /^[a-z][a-z0-9-]*$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const ALLOWED_CATEGORIES: Readonly<Record<Access, readonly Category[]>> = {
  read: ['read'],
  write: ['read', 'write'],
};

const reject = (reason: string): InvocationResult => ({ ok: false, reason });

const isFlag = (token: string) => LONG_FLAG.test(token);
const flagName = (token: string) => token.split('=', 1)[0] ?? token;

/** Flag tokens with any `--flag=value` split, for analysis only; the agent's tokens are passed through unchanged. */
const analysisTokens = (tokens: readonly string[]) =>
  tokens.flatMap((token) => (isFlag(token) && token.includes('=') ? [flagName(token), token.slice(token.indexOf('=') + 1)] : [token]));

const valuesOf = (tokens: readonly string[], flag: string) =>
  tokens.flatMap((token, i) => (token === flag && i + 1 < tokens.length ? [tokens[i + 1] as string] : []));

function checkToken(token: string): string | undefined {
  if (token === '-') return 'Reading from stdin ("-") is not available.';
  if (token.startsWith('@')) return `"${token}" looks like a file reference; local files are not available, pass the value inline.`;
  if (SHORT_FLAG.test(token)) return `Short flag "${token}" is not allowed: use the long form (for example --project, not -p).`;
  if (!isFlag(token)) return undefined;
  const name = flagName(token);
  const forbidden =
    FORBIDDEN_FLAGS.get(name) ??
    [...FORBIDDEN_FLAG_PREFIXES].find(([prefix]) => name.startsWith(prefix))?.[1];
  return forbidden ? `${name} is not allowed: ${forbidden}.` : undefined;
}

function checkCategory(operation: OperationInfo, category: Category, access: Access): string | undefined {
  if (ALLOWED_CATEGORIES[access].includes(category)) return undefined;
  const command = operation.name.replaceAll('.', ' ');
  if (category === 'write') {
    return `"${command}" is a write operation and this tool is read-only. Use kbagent_write if you have it, otherwise ask the user.`;
  }
  return `"${command}" is ${category}: it must be done by a human in the Keboola UI. Tell the user what to do instead.`;
}

function scopeProject(tokens: readonly string[], operation: OperationInfo, project: string | undefined) {
  if (project === undefined) return { inject: [] as string[] };
  if (!SAFE_ID.test(project)) return { error: 'The configured Keboola project alias is invalid.' };
  const crossProject = tokens.find((token) => CROSS_PROJECT_FLAGS.has(token));
  if (crossProject) return { error: `${crossProject} is not allowed: this tool is limited to project "${project}".` };
  const values = valuesOf(tokens, '--project');
  if (values.some((value) => value !== project)) return { error: `This tool is limited to project "${project}".` };
  return { inject: values.length === 0 && operation.acceptsProject ? ['--project', project] : [] };
}

function scopeBranch(
  tokens: readonly string[],
  operation: OperationInfo,
  category: Category,
  branch: string | number | undefined,
) {
  if (branch === undefined) return { inject: [] as string[] };
  const id = String(branch);
  if (!SAFE_ID.test(id)) return { error: 'The configured Keboola branch id is invalid.' };
  if (valuesOf(tokens, '--branch').some((value) => value !== id)) {
    return { error: `This tool is limited to development branch ${id}.` };
  }
  if (category === 'write' && !operation.acceptsBranch && !BRANCH_AGNOSTIC_WRITES.has(operation.name)) {
    return {
      error: `"${operation.name.replaceAll('.', ' ')}" cannot be limited to development branch ${id} and would change production. Ask the user to do it.`,
    };
  }
  const hasBranch = tokens.includes('--branch');
  return { inject: !hasBranch && operation.acceptsBranch ? ['--branch', id] : [] };
}

/**
 * Without a pinned branch, writes must name a development branch: production changes only through kbagent_promote,
 * which the user approves. Creating a branch and workspace work never touch production data.
 */
function checkProductionSafety(tokens: readonly string[], operation: OperationInfo, productionBranch: string | undefined) {
  if (BRANCH_AGNOSTIC_WRITES.has(operation.name)) return undefined;
  const command = operation.name.replaceAll('.', ' ');
  if (!operation.acceptsBranch) return `"${command}" cannot be limited to a development branch and would change production. Ask the user to do it.`;
  if (productionBranch === undefined) {
    return 'The production branch of this project is not known, so writes are blocked. Try again; if it keeps failing, ask the user to check kbagent.';
  }
  const branches = valuesOf(tokens, '--branch');
  if (branches.length === 0) {
    return 'Writes run on a development branch only: pass --branch <id> (create one with ["branch", "create", "--name", "..."]).';
  }
  const production = branches.find((id) => id === '0' || id === productionBranch);
  if (production !== undefined) {
    return `Branch ${production} is production. Writes run on a development branch only; production changes through a promotion the user approves.`;
  }
  return undefined;
}

/** "workspace commands: create, list" when all operations share a group, else the full names. */
function describeOperations(operations: ReadonlySet<string>): string {
  const names = [...operations].toSorted();
  const groups = new Set(names.map((name) => name.split('.')[0]));
  const [group] = groups;
  if (groups.size === 1 && group) return `${group} commands: ${names.map((name) => name.slice(group.length + 1).replaceAll('.', ' ')).join(', ')}`;
  return names.map((name) => name.replaceAll('.', ' ')).join(', ');
}

const outsideAllowlist = (command: string, operations: ReadonlySet<string>) =>
  reject(`"${command}" is not available in this tool. It only runs ${describeOperations(operations)}.`);

function globalFlags(access: Access, conversationId: string | undefined): string[] {
  const firewall = access === 'read' ? '--deny-writes' : '--deny-destructive';
  return ['--json', firewall, ...(conversationId === undefined ? [] : ['--conversation-id', conversationId])];
}

/** Operation name for a call's args (e.g. "config.list"), without any policy check; for UI labels. */
export function operationOf(args: readonly string[]): string | undefined {
  const tokens = args.filter((token) => typeof token === 'string' && !DROPPED_FLAGS.has(token));
  const firstNonWord = tokens.findIndex((token) => !COMMAND_WORD.test(token));
  return lookupOperation(firstNonWord === -1 ? tokens : tokens.slice(0, firstNonWord))?.name;
}

export function buildInvocation(request: InvocationRequest): InvocationResult {
  const { args, access, project, branch, productionBranch, conversationId, operations: allowlist } = request;
  if (!Array.isArray(args) || !args.every((token) => typeof token === 'string')) {
    return reject('args must be an array of strings.');
  }
  if (args.some((token) => token.includes('\u0000'))) return reject('Arguments must not contain NUL bytes.');
  if (conversationId !== undefined && !SAFE_ID.test(conversationId)) return reject('Invalid conversation id.');

  const tokens = args.filter((token) => !DROPPED_FLAGS.has(token));
  const first = tokens[0];
  if (first === undefined) return reject('Provide a kbagent command, for example ["config", "list"].');
  if (!COMMAND_WORD.test(first)) {
    return reject('Arguments must start with the command name, for example ["config", "list", "--component-type", "transformation"].');
  }

  const deniedGroup = DENIED_GROUPS.get(first);
  if (deniedGroup) return reject(`kbagent ${first} is not available to agents: ${deniedGroup}.`);

  const tokenError = tokens.map(checkToken).find(Boolean);
  if (tokenError) return reject(tokenError);

  const firstNonWord = tokens.findIndex((token) => !COMMAND_WORD.test(token));
  const commandWords = firstNonWord === -1 ? tokens : tokens.slice(0, firstNonWord);
  const operation = lookupOperation(commandWords);
  const help = tokens.includes('--help');

  if (!operation) {
    const groupAllowed = !allowlist || [...allowlist].some((name) => name.startsWith(`${first}.`));
    if (help && isKnownGroup(first) && groupAllowed) {
      return { ok: true, argv: [...globalFlags('read', conversationId), ...tokens], operation: first, category: 'read' };
    }
    if (allowlist && isKnownGroup(first)) return outsideAllowlist(commandWords.join(' '), allowlist);
    return reject(`Unknown kbagent command "${commandWords.join(' ')}". Use ["${first}", "--help"] to list commands.`);
  }
  const denied = DENIED_OPERATIONS.get(operation.name);
  if (denied) return reject(`"${operation.name.replaceAll('.', ' ')}" is not available to agents: ${denied}.`);
  const analysed = analysisTokens(tokens);
  const category = categorize(operation, analysed);
  // Destructive/admin operations fall through to the clearer "must be done by a human" message.
  if (allowlist && !allowlist.has(operation.name) && (category === 'read' || category === 'write')) {
    return outsideAllowlist(operation.name.replaceAll('.', ' '), allowlist);
  }
  if (help) return { ok: true, argv: [...globalFlags(access, conversationId), ...tokens], operation: operation.name, category: 'read' };

  const categoryError = checkCategory(operation, category, access);
  if (categoryError) return reject(categoryError);
  if (operation.name.startsWith('semantic-layer.') && analysed.includes('--scope')) {
    return reject('Sharing semantic-layer objects with other projects must be done by the user.');
  }

  const projectScope = scopeProject(analysed, operation, project);
  if ('error' in projectScope) return reject(projectScope.error as string);
  const branchScope = scopeBranch(analysed, operation, category, branch);
  if ('error' in branchScope) return reject(branchScope.error as string);
  const productionError = category === 'write' && branch === undefined ? checkProductionSafety(analysed, operation, productionBranch) : undefined;
  if (productionError) return reject(productionError);

  return {
    ok: true,
    argv: [...globalFlags(access, conversationId), ...tokens, ...projectScope.inject, ...branchScope.inject],
    operation: operation.name,
    category,
  };
}
