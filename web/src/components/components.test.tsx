import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { initialRunState, reduceRun } from '../state/run-state.ts';
import { ActivityPanel } from './ActivityPanel.tsx';
import { ApprovalCard } from './ApprovalCard.tsx';
import { Composer } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';

describe('Composer', () => {
  it('sends on Enter, keeps Shift+Enter for new lines, and clears the box', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={() => {}} running={false} disabled={false} />);
    const box = screen.getByRole('textbox');

    await userEvent.type(box, 'first line{Shift>}{Enter}{/Shift}second{Enter}');

    expect(onSend).toHaveBeenCalledWith('first line\nsecond');
    expect(box).toHaveValue('');
  });

  it('does not send blank text and shows Stop while running', async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(<Composer onSend={onSend} onStop={onStop} running={false} disabled={false} />);
    await userEvent.type(screen.getByRole('textbox'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();

    rerender(<Composer onSend={onSend} onStop={onStop} running disabled={false} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onStop).toHaveBeenCalled();
  });
});

describe('ApprovalCard', () => {
  const approval = {
    interruptId: 'i1',
    requests: [
      { tool: 'write_file', args: { file_path: '/agents/x/AGENT.md', content: '---\nname: x\n---' }, decisions: ['approve', 'reject'] },
      { tool: 'kbagent_write', args: { args: ['branch', 'create', '--name', 'fix'], purpose: 'Make a dev branch' }, decisions: ['approve'] },
    ],
  };

  it('shows what will happen and answers every request at once', async () => {
    const onAnswer = vi.fn();
    render(<ApprovalCard approval={approval} onAnswer={onAnswer} busy={false} />);

    expect(screen.getByText('/agents/x/AGENT.md')).toBeInTheDocument();
    expect(screen.getByText('kbagent branch create --name fix')).toBeInTheDocument();
    expect(screen.getByText('Make a dev branch')).toBeInTheDocument();

    const [approve, reject] = screen.getAllByRole('button');
    await userEvent.click(approve as HTMLElement);
    expect(onAnswer).toHaveBeenLastCalledWith([{ type: 'approve' }, { type: 'approve' }]);
    await userEvent.click(reject as HTMLElement);
    expect(onAnswer.mock.lastCall?.[0]).toHaveLength(2);
    expect(onAnswer.mock.lastCall?.[0][0].type).toBe('reject');
  });

  it('falls back to raw JSON for other tools', () => {
    render(<ApprovalCard approval={{ interruptId: 'i', requests: [{ tool: 'other', args: { a: 1 }, decisions: [] }] }} onAnswer={() => {}} busy />);
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
  });
});

describe('MessageBubble', () => {
  it('renders agent Markdown but never raw HTML', () => {
    render(<MessageBubble role="assistant" text={'**bold** <img src=x onerror=alert(1)> [link](https://example.com)'} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows user text as typed', () => {
    render(<MessageBubble role="user" text="**not bold**" />);
    expect(screen.getByText('**not bold**')).toBeInTheDocument();
  });
});

describe('ActivityPanel', () => {
  it('lists the newest activity first with usage', () => {
    const run = [
      { type: 'usage', agent: 'lead', input: 1200, output: 30, cached: 1000 },
      { type: 'delegate.start', agent: 'lead', callId: 'd', to: 'helper', task: 'Find tables' },
      { type: 'tool.start', agent: 'helper', callId: 't', tool: 'kbagent_read', args: { purpose: 'List configs' } },
    ].reduce(reduceRun as never, initialRunState('lead'));

    render(<ActivityPanel run={run} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('List configs');
    expect(items[1]).toHaveTextContent('Find tables');
    expect(screen.getByText(/1,200|1 200/)).toBeInTheDocument();
  });

  it('says when nothing happened yet', () => {
    render(<ActivityPanel run={initialRunState('lead')} />);
    expect(screen.getByText('Пока ничего не происходит.')).toBeInTheDocument();
  });
});
