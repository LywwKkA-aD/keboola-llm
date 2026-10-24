import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import type { PendingApprovalEntry } from '../api/types.ts';
import { FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';
import { tabTitle } from './tab-title.ts';

const pending = (threadId: string): PendingApprovalEntry => ({
  threadId,
  threadTitle: 'Chat',
  interruptId: `i-${threadId}`,
  requests: [{ tool: 'write_file', args: {}, decisions: ['approve', 'reject'] }],
});

afterEach(() => {
  document.title = 'Agent Studio';
});

describe('tabTitle', () => {
  it('counts what waits for the user, plain otherwise', () => {
    expect(tabTitle('Agent Studio', 2)).toBe('(2) Agent Studio');
    expect(tabTitle('Agent Studio', 0)).toBe('Agent Studio');
  });
});

describe('tab title', () => {
  it('counts the approvals that wait and goes plain when none do', async () => {
    stubEventSource();
    let approvals = [pending('t1'), pending('t2')];
    stubApi({ ...baseRoutes, 'GET /api/approvals': () => approvals });
    window.history.pushState({}, '', '/approvals');
    render(<App />);
    await waitFor(() => expect(document.title).toBe('(2) Agent Studio'));

    approvals = [];
    act(() => FakeEventSource.global().emit({ type: 'run.started', runId: 'r', resume: true }, 't1'));
    await waitFor(() => expect(document.title).toBe('Agent Studio'));
  });
});
