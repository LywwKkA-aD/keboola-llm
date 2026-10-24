/** What an agent's action from the live feed shows in its card: a short title, a status and a detail view. Pure. */
import type { StringKey } from '../i18n/strings.ts';
import type { FeedItem } from '../live/live-state.ts';
import { KIND_TONE, kindOf } from './steps.ts';

export type ActionView =
  | { readonly type: 'diff'; readonly path: string; readonly before: string; readonly after: string }
  | { readonly type: 'file'; readonly path: string; readonly content: string }
  | { readonly type: 'command'; readonly purpose?: string; readonly command: string }
  | { readonly type: 'sql'; readonly purpose?: string; readonly sql: string; readonly command: string }
  | { readonly type: 'lookup'; readonly target: string; readonly pattern?: string }
  | { readonly type: 'delegation'; readonly from: string; readonly to: string; readonly task: string; readonly answer?: string }
  | { readonly type: 'todos'; readonly todos: readonly { readonly content?: unknown; readonly status?: unknown }[] }
  | { readonly type: 'plan'; readonly title?: string; readonly plan?: string }
  | { readonly type: 'error'; readonly text: string }
  | { readonly type: 'raw'; readonly args: Readonly<Record<string, unknown>> }
  | { readonly type: 'none' };

export type ActionStatus = 'running' | 'done' | 'failed' | 'waiting' | 'answered';

export interface ActionTitle {
  /** What was done ("Edit", "SQL"), when the action has a plain name. */
  readonly verb?: StringKey;
  readonly text: string;
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** The first line of a text, cut to a title's length. */
function firstLine(text: string, max = 80): string {
  const line = text.split('\n').find((entry) => entry.trim())?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** "keboola-change/SKILL.md" for "/skills/custom/keboola-change/SKILL.md". */
export const shortPath = (path: string) => path.split('/').filter(Boolean).slice(-2).join('/');

const argList = (args: Readonly<Record<string, unknown>>) => (Array.isArray(args.args) ? args.args.map(String) : undefined);

/** The SQL of a kbagent_sql query (the value after --sql), if it has one. */
function sqlOf(list: readonly string[] | undefined): string | undefined {
  const at = list?.indexOf('--sql') ?? -1;
  return at >= 0 ? list?.[at + 1] : undefined;
}

const purposeOf = (args: Readonly<Record<string, unknown>>) => (str(args.purpose) ? { purpose: str(args.purpose) as string } : {});

/** What the detail of a tool call shows, from its name and arguments. */
export function toolView(tool: string, args: Readonly<Record<string, unknown>>): ActionView {
  const path = str(args.file_path);
  if (path !== undefined && str(args.old_string) !== undefined && str(args.new_string) !== undefined) {
    return { type: 'diff', path, before: str(args.old_string) as string, after: str(args.new_string) as string };
  }
  if (path !== undefined && str(args.content) !== undefined) return { type: 'file', path, content: str(args.content) as string };
  const list = argList(args);
  const sql = tool === 'kbagent_sql' ? sqlOf(list) : undefined;
  if (list && sql !== undefined) {
    const command = list.map((entry, index) => (list[index - 1] === '--sql' ? '…' : entry)).join(' ');
    return { type: 'sql', ...purposeOf(args), sql, command: `kbagent ${command}` };
  }
  if (list) return { type: 'command', ...purposeOf(args), command: `kbagent ${list.join(' ')}` };
  if (tool === 'read_file' && path !== undefined) return { type: 'lookup', target: path };
  if (tool === 'ls' || tool === 'grep' || tool === 'glob') {
    const pattern = str(args.pattern);
    return { type: 'lookup', target: str(args.path) ?? '/', ...(pattern ? { pattern } : {}) };
  }
  if (tool === 'write_todos' && Array.isArray(args.todos)) return { type: 'todos', todos: args.todos as { content?: unknown; status?: unknown }[] };
  if (tool === 'request_plan_approval') {
    return { type: 'plan', ...(str(args.title) ? { title: str(args.title) as string } : {}), ...(str(args.plan) ? { plan: str(args.plan) as string } : {}) };
  }
  return Object.keys(args).length > 0 ? { type: 'raw', args } : { type: 'none' };
}

/** What the detail of an action shows. */
export function actionView(item: FeedItem): ActionView {
  if (item.kind === 'error') return { type: 'error', text: item.text };
  if (item.kind === 'delegate') {
    const answer = item.result?.preview || item.outcome;
    return { type: 'delegation', from: item.agent, to: item.target, task: str(item.args?.task) ?? item.text, ...(answer ? { answer } : {}) };
  }
  return toolView(item.target, item.args ?? {});
}

function toolTitle(item: FeedItem): ActionTitle {
  const args = item.args ?? {};
  const path = str(args.file_path) ?? '';
  const purpose = str(args.purpose);
  switch (item.target) {
    case 'edit_file':
      return { verb: 'action.edit', text: shortPath(path) };
    case 'write_file':
      return { verb: 'action.write', text: shortPath(path) };
    case 'read_file':
      return { verb: 'action.read', text: shortPath(path) };
    case 'ls':
      return { verb: 'action.list', text: str(args.path) ?? '/' };
    case 'grep':
    case 'glob':
      return { verb: 'action.search', text: [`"${str(args.pattern) ?? ''}"`, str(args.path)].filter(Boolean).join(' · ') };
    case 'write_todos':
    case 'request_plan_approval':
      return { verb: 'action.plan', text: str(args.title) ?? '' };
    default:
      break;
  }
  const sql = item.target === 'kbagent_sql' ? sqlOf(argList(args)) : undefined;
  if (sql !== undefined) return { verb: 'action.sql', text: purpose ?? firstLine(sql) };
  if (item.target.startsWith('kbagent')) return { verb: 'action.keboola', text: purpose ?? str(args.summary) ?? (argList(args) ?? []).slice(0, 3).join(' ') };
  return { text: [item.target, item.text].filter(Boolean).join(' · ') };
}

/** A few words for the list, from the side of the agent whose card it is. */
export function actionTitle(item: FeedItem, viewer: string): ActionTitle {
  if (item.kind === 'error') return { text: item.text };
  if (item.kind === 'delegate') {
    const task = firstLine(str(item.args?.task) ?? item.text);
    return item.agent === viewer ? { verb: 'action.delegated', text: `${item.target}: ${task}` } : { verb: 'action.taskFrom', text: `${item.agent}: ${task}` };
  }
  return toolTitle(item);
}

/** Where the action stands; an approval waits while it is among the pending ones. */
export function actionStatus(item: FeedItem, pending: readonly { readonly threadId: string; readonly interruptId: string }[]): ActionStatus {
  if (item.kind === 'error') return 'failed';
  if (item.kind === 'approval') {
    return pending.some((entry) => entry.threadId === item.threadId && entry.interruptId === item.interruptId) ? 'waiting' : 'answered';
  }
  if (item.kind === 'auto') return 'done';
  if (!item.result) return 'running';
  return item.result.ok ? 'done' : 'failed';
}

/** The chip of an action: the step kinds of the chat, plus approvals and failures. */
export function actionBadge(item: FeedItem): { readonly key: StringKey; readonly tone: '' | 'blue' | 'green' | 'amber' | 'red' } {
  if (item.kind === 'error') return { key: 'status.failed', tone: 'red' };
  if (item.kind === 'approval') return { key: 'kind.approval', tone: 'amber' };
  const kind = kindOf({ kind: item.kind === 'delegate' || item.kind === 'auto' ? item.kind : 'tool', target: item.target });
  return { key: `kind.${kind}` as StringKey, tone: KIND_TONE[kind] };
}

/** What an expanded chat step shows: the same views as the agent card; a delegation shows its whole task. */
export function stepView(step: { readonly kind: string; readonly agent: string; readonly target: string; readonly label: string; readonly args?: Readonly<Record<string, unknown>> }): ActionView {
  if (step.kind === 'delegate') return { type: 'delegation', from: step.agent, to: step.target, task: step.label };
  return toolView(step.target, step.args ?? {});
}
