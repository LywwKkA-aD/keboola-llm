import { describe, expect, it } from 'vitest';
import type { FeedItem } from '../live/live-state.ts';
import { actionBadge, actionStatus, actionTitle, actionView, shortPath } from './actions.ts';

const tool = (target: string, args: Record<string, unknown>, extra: Partial<FeedItem> = {}): FeedItem => ({
  id: '1',
  threadId: 't1',
  at: 0,
  kind: 'tool',
  agent: 'agent-builder',
  target,
  text: '',
  callId: 'c1',
  args,
  ...extra,
});

describe('actionView', () => {
  it('shows an edit as a diff of the replaced text', () => {
    expect(actionView(tool('edit_file', { file_path: '/agents/a/AGENT.md', old_string: 'old', new_string: 'new' }))).toEqual({
      type: 'diff',
      path: '/agents/a/AGENT.md',
      before: 'old',
      after: 'new',
    });
  });

  it('shows a written file with its content', () => {
    expect(actionView(tool('write_file', { file_path: '/knowledge/a.md', content: '# A' }))).toEqual({ type: 'file', path: '/knowledge/a.md', content: '# A' });
  });

  it('shows a kbagent call as the command, and SQL as the query itself', () => {
    expect(actionView(tool('kbagent_read', { args: ['config', 'list', '--component-id', 'x'], purpose: 'List configs' }))).toEqual({
      type: 'command',
      purpose: 'List configs',
      command: 'kbagent config list --component-id x',
    });
    expect(actionView(tool('kbagent_sql', { args: ['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1'], purpose: 'Count' }))).toEqual({
      type: 'sql',
      purpose: 'Count',
      sql: 'SELECT 1',
      command: 'kbagent workspace query --workspace-id 7 --sql …',
    });
    expect(actionView(tool('kbagent_sql', { args: ['workspace', 'list'] }))).toMatchObject({ type: 'command', command: 'kbagent workspace list' });
  });

  it('shows what a lookup looked at', () => {
    expect(actionView(tool('read_file', { file_path: '/skills/x/SKILL.md' }))).toEqual({ type: 'lookup', target: '/skills/x/SKILL.md' });
    expect(actionView(tool('grep', { pattern: 'customer_id', path: '/knowledge' }))).toEqual({ type: 'lookup', target: '/knowledge', pattern: 'customer_id' });
    expect(actionView(tool('ls', { path: '/memories' }))).toEqual({ type: 'lookup', target: '/memories' });
  });

  it('shows a delegation as the task and the answer so far', () => {
    const delegation: FeedItem = { ...tool('keboola-expert', { task: 'Find tables' }), kind: 'delegate', agent: 'lead', outcome: 'Found 3' };
    expect(actionView(delegation)).toEqual({ type: 'delegation', from: 'lead', to: 'keboola-expert', task: 'Find tables', answer: 'Found 3' });
    const done = { ...delegation, outcome: undefined, result: { ok: true, preview: 'Found 4' } };
    expect(actionView(done)).toMatchObject({ answer: 'Found 4' });
  });

  it('shows plans, failures and anything else as it is', () => {
    expect(actionView(tool('write_todos', { todos: [{ content: 'A', status: 'completed' }] }))).toEqual({ type: 'todos', todos: [{ content: 'A', status: 'completed' }] });
    expect(actionView(tool('request_plan_approval', { title: 'Fix', plan: '1. Do' }))).toEqual({ type: 'plan', title: 'Fix', plan: '1. Do' });
    expect(actionView({ ...tool('', {}), kind: 'error', agent: '', text: 'model down' })).toEqual({ type: 'error', text: 'model down' });
    expect(actionView(tool('custom', { a: 1 }))).toEqual({ type: 'raw', args: { a: 1 } });
    expect(actionView(tool('custom', {}))).toEqual({ type: 'none' });
  });
});

describe('actionTitle', () => {
  it('names the action in a few words, from the agent\'s side', () => {
    expect(actionTitle(tool('edit_file', { file_path: '/agents/keboola-expert/AGENT.md' }), 'agent-builder')).toEqual({ verb: 'action.edit', text: 'keboola-expert/AGENT.md' });
    expect(actionTitle(tool('kbagent_read', { purpose: 'List configs', args: [] }), 'x')).toEqual({ verb: 'action.keboola', text: 'List configs' });
    expect(actionTitle(tool('kbagent_sql', { args: ['workspace', 'query', '--sql', 'SELECT a\nFROM b'] }), 'x')).toEqual({ verb: 'action.sql', text: 'SELECT a' });
    expect(actionTitle(tool('grep', { pattern: 'id', path: '/knowledge' }), 'x')).toEqual({ verb: 'action.search', text: '"id" · /knowledge' });
    const delegation: FeedItem = { ...tool('keboola-expert', { task: 'Find tables\nin sandbox' }), kind: 'delegate', agent: 'lead' };
    expect(actionTitle(delegation, 'lead')).toEqual({ verb: 'action.delegated', text: 'keboola-expert: Find tables' });
    expect(actionTitle(delegation, 'keboola-expert')).toEqual({ verb: 'action.taskFrom', text: 'lead: Find tables' });
    expect(actionTitle(tool('custom', {}, { text: 'hint' }), 'x')).toEqual({ text: 'custom · hint' });
  });
});

describe('actionStatus', () => {
  it('tells running, done, failed and waiting apart', () => {
    expect(actionStatus(tool('ls', {}), [])).toBe('running');
    expect(actionStatus(tool('ls', {}, { result: { ok: true, preview: '' } }), [])).toBe('done');
    expect(actionStatus(tool('ls', {}, { result: { ok: false, preview: '' } }), [])).toBe('failed');
    const approval: FeedItem = { ...tool('write_file', {}), kind: 'approval', interruptId: 'i1' };
    expect(actionStatus(approval, [{ threadId: 't1', interruptId: 'i1' }])).toBe('waiting');
    expect(actionStatus(approval, [])).toBe('answered');
    expect(actionStatus({ ...approval, kind: 'auto' }, [])).toBe('done');
    expect(actionStatus({ ...approval, kind: 'error' }, [])).toBe('failed');
  });
});

describe('actionBadge', () => {
  it('uses the step kinds of the chat, plus approvals and errors', () => {
    expect(actionBadge(tool('edit_file', {}))).toEqual({ key: 'kind.write', tone: 'amber' });
    expect(actionBadge(tool('kbagent_sql', {}))).toEqual({ key: 'kind.sql', tone: 'green' });
    expect(actionBadge({ ...tool('write_file', {}), kind: 'approval' })).toEqual({ key: 'kind.approval', tone: 'amber' });
    expect(actionBadge({ ...tool('', {}), kind: 'error' })).toEqual({ key: 'status.failed', tone: 'red' });
  });
});

describe('shortPath', () => {
  it('keeps the last two parts of a path', () => {
    expect(shortPath('/skills/custom/keboola-change/SKILL.md')).toBe('keboola-change/SKILL.md');
    expect(shortPath('/a.md')).toBe('a.md');
    expect(shortPath('')).toBe('');
  });
});
