import type { TeamInfo, Thread, UsageReport, UsageTotals } from '../api/types.ts';
import { SETUP_COMPLETE } from './setup-fixtures.ts';

export const TEAM: TeamInfo = {
  lead: 'lead',
  agents: [
    { name: 'component-builder', description: 'Builds Python components.', role: 'subagent', enabled: false, skills: [], tools: [] },
    {
      name: 'keboola-expert',
      description: 'Answers Keboola questions.',
      role: 'subagent',
      enabled: true,
      skills: ['kbagent'],
      tools: ['kbagent'],
      access: 'read',
      avatar: { color: '#123456', prop: 'telescope' },
      basedOn: 'vendor/keboola/cli/plugins/kbagent/agents/keboola-expert.md',
    },
    { name: 'lead', description: 'Leads the team.', role: 'orchestrator', enabled: true, skills: [], tools: [], avatar: { color: '#1F8FFF' } },
  ],
  skills: [{ name: 'kbagent', description: 'CLI', source: 'cli-kbagent' }],
  warnings: ['keboola-expert: unknown skill "ghost"'],
  loadErrors: [],
};

export const THREADS: Thread[] = [
  { id: 't1', title: 'Где используется customer_id?', createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T11:00:00Z' },
  { id: 't2', title: 'Почему упал джоб?', createdAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T11:00:00Z' },
];

const NO_USAGE: UsageTotals = { calls: 0, input: 0, cached: 0, cacheWrite: 0, output: 0 };

/** A usage report with `today` (and the week and total) as given; no history. */
export const usageReport = (today: Partial<UsageTotals> = {}, agents: UsageReport['agents'] = []): UsageReport => {
  const totals = { ...NO_USAGE, ...today };
  return { today: totals, week: totals, total: totals, days: [{ date: '2026-10-24', ...totals }], agents };
};

/** The routes every page needs; tests spread their own on top. */
export const baseRoutes = {
  'GET /api/settings': { language: 'ru' },
  'GET /api/approvals': [],
  'GET /api/status': { model: 'cc/model', keboolaProject: 'sandbox', version: '0.1.0', activeRuns: 0, pendingApprovals: 0 },
  'GET /api/team': TEAM,
  'GET /api/threads': THREADS,
  'GET /api/threads/t1/messages': [
    { id: 'h1', role: 'user', text: 'Где используется customer_id?' },
    { id: 'a1', role: 'assistant', text: 'В **двух** трансформациях.' },
  ],
  'GET /api/threads/t1/policy': { allowSql: false },
  'GET /api/threads/t2/messages': [],
  'GET /api/threads/t2/policy': { allowSql: false },
  'GET /api/routines': { routines: [], loadErrors: [] },
  'GET /api/setup': SETUP_COMPLETE,
  'GET /api/usage': usageReport(),
  'GET /api/activity': [],
};
