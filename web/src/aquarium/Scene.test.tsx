import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../api/types.ts';
import { Scene } from './Scene.tsx';
import { initialAquarium, reduceAquarium } from './state.ts';

const agent = (name: string, prop?: string, role: AgentInfo['role'] = 'subagent'): AgentInfo => ({
  name,
  description: 'd',
  role,
  enabled: true,
  skills: [],
  tools: [],
  avatar: { color: '#3d5afe', ...(prop ? { prop } : {}) },
});

const agents = [agent('lead', 'headset', 'orchestrator'), agent('keboola-expert', 'telescope'), agent('odd-one', 'unknown-prop')];

describe('Scene', () => {
  it('draws every agent with its name and a mood class', () => {
    const { container } = render(<Scene agents={agents} lead="lead" state={initialAquarium('lead')} now={0} label="Aquarium" />);
    expect(screen.getByRole('img', { name: 'Aquarium' })).toBeInTheDocument();
    agents.forEach(({ name }) => expect(screen.getByText(name.replace(/^kbc-/, ''))).toBeInTheDocument());
    expect(container.querySelectorAll('.octo--idle')).toHaveLength(3);
    // Unknown props fall back to a lettered badge.
    expect(screen.getByText('O')).toBeInTheDocument();
  });

  it('captions busy agents, moves them and lights up the computers', () => {
    const state = reduceAquarium(
      initialAquarium('lead'),
      { seq: 1, threadId: 't', event: { type: 'tool.start', agent: 'keboola-expert', callId: 'c', tool: 'kbagent_read', args: { purpose: 'List buckets' } } },
      0,
    );
    const { container } = render(<Scene agents={agents} lead="lead" state={state} now={0} label="Aquarium" />);

    expect(screen.getByText('List buckets')).toBeInTheDocument();
    expect(container.querySelector('.octo--computing')).not.toBeNull();
    expect(container.querySelectorAll('.aq-code').length).toBeGreaterThan(0);
  });

  it('rings the bell and shows a question mark for an agent waiting for approval', () => {
    const started = reduceAquarium(
      initialAquarium('lead'),
      { seq: 1, threadId: 't', event: { type: 'tool.start', agent: 'odd-one', callId: 'c', tool: 'write_file', args: {} } },
      0,
    );
    const waiting = reduceAquarium(
      started,
      { seq: 2, threadId: 't', event: { type: 'approval.required', interruptId: 'i', requests: [{ tool: 'write_file', args: {}, decisions: [] }] } },
      0,
    );
    const { container } = render(<Scene agents={agents} lead="lead" state={waiting} now={0} label="Aquarium" />);
    expect(container.querySelector('.aq-bell--ringing')).not.toBeNull();
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
