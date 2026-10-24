import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { errorResponse, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

const BRANCH = {
  threadId: 't1',
  threadTitle: 'Fix the orders join',
  interruptId: 'i1',
  requests: [{ tool: 'kbagent_write', agent: 'keboola-expert', args: { args: ['branch', 'create', '--name', 'fix'], purpose: 'Dev branch' }, decisions: ['approve', 'reject'] }],
};
const FILE = {
  threadId: 't2',
  threadTitle: 'New SQL style skill',
  interruptId: 'i2',
  requests: [{ tool: 'write_file', agent: 'agent-builder', args: { file_path: '/skills/custom/sql/SKILL.md', content: '# SQL style' }, decisions: ['approve', 'reject'] }],
};

async function openApprovals(routes: Record<string, unknown>) {
  const api = stubApi({ ...baseRoutes, ...routes });
  window.history.pushState({}, '', '/approvals');
  render(<App />);
  return api;
}

beforeEach(() => {
  stubEventSource();
});

describe('Approvals page', () => {
  it('says when nothing waits', async () => {
    await openApprovals({});
    expect(await screen.findByText('Подтверждать нечего.')).toBeInTheDocument();
  });

  it('lists pending actions across chats and shows the selected one in detail', async () => {
    await openApprovals({ 'GET /api/approvals': [BRANCH, FILE] });

    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    const detail = screen.getByRole('region', { name: 'Нужно подтверждение' });
    expect(within(detail).getByText('kbagent branch create --name fix')).toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: 'Открыть чат' })).toHaveAttribute('href', '/chat/t1');

    await userEvent.click(within(list).getByRole('button', { name: /New SQL style skill/ }));
    expect(within(detail).getByText('/skills/custom/sql/SKILL.md')).toBeInTheDocument();
    expect(within(detail).getByText('# SQL style')).toBeInTheDocument();
    expect(within(detail).getByText('agent-builder')).toBeInTheDocument();
  });

  it('approves, and rejects with the comment for the agent', async () => {
    const { callsTo } = await openApprovals({
      'GET /api/approvals': [BRANCH, FILE],
      'POST /api/threads/t1/approvals': { runId: 'r' },
      'POST /api/threads/t2/approvals': { runId: 'r' },
    });
    await screen.findByText('kbagent branch create --name fix');

    await userEvent.click(screen.getByRole('button', { name: 'Разрешить' }));
    expect(callsTo('POST', '/api/threads/t1/approvals')[0]?.body).toEqual({ answers: [{ interruptId: 'i1', decisions: [{ type: 'approve' }] }] });

    await userEvent.click(screen.getByRole('button', { name: /New SQL style skill/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Комментарий (необязательно)' }), 'Use our naming');
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
    expect(callsTo('POST', '/api/threads/t2/approvals')[0]?.body).toEqual({
      answers: [{ interruptId: 'i2', decisions: [{ type: 'reject', message: 'Use our naming' }] }],
    });
  });

  it('shows why an answer failed', async () => {
    await openApprovals({ 'GET /api/approvals': [BRANCH], 'POST /api/threads/t1/approvals': () => errorResponse(409, 'No pending approvals for this thread') });
    await userEvent.click(await screen.findByRole('button', { name: 'Разрешить' }));
    expect(await screen.findByText('No pending approvals for this thread')).toBeInTheDocument();
  });
});
