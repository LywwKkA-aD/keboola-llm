import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { initialRunState, reduceRun } from '../state/run-state.ts';
import { ApprovalCard } from './ApprovalCard.tsx';
import { Composer } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { SqlToggle } from './SqlToggle.tsx';
import { StepRows } from './StepRows.tsx';

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

  it('shows a plan the lead asks to approve as readable Markdown under a plain title', () => {
    const plan = {
      interruptId: 'p',
      requests: [
        {
          tool: 'request_plan_approval',
          agent: 'lead',
          args: { title: 'Fix the shipping fan-out', plan: '1. Create a **dev branch**\n2. Edit Shop 02' },
          decisions: ['approve', 'reject'],
        },
      ],
    };
    render(<ApprovalCard approval={plan} onAnswer={() => {}} busy={false} />);
    expect(screen.getByText('План изменений')).toBeInTheDocument();
    expect(screen.queryByText('request_plan_approval')).toBeNull();
    expect(screen.getByText('Fix the shipping fan-out')).toBeInTheDocument();
    expect(screen.getByText('dev branch').tagName).toBe('STRONG');
  });

  it('falls back to raw JSON for other tools', () => {
    render(<ApprovalCard approval={{ interruptId: 'i', requests: [{ tool: 'other', args: { a: 1 }, decisions: [] }] }} onAnswer={() => {}} busy />);
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
  });
});

describe('SqlToggle', () => {
  it('reports the new permission when clicked', async () => {
    const onChange = vi.fn();
    render(<SqlToggle checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
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

describe('StepRows', () => {
  const steps = [
    { event: { type: 'delegate.start', agent: 'lead', callId: 'd', to: 'kbc-sql-reviewer', task: 'Review the orders SQL' }, at: 1000 },
    { event: { type: 'tool.start', agent: 'kbc-sql-reviewer', callId: 't', tool: 'kbagent_read', args: { args: ['config', 'list'], purpose: 'List configs' } }, at: 1100 },
    { event: { type: 'tool.end', agent: 'kbc-sql-reviewer', callId: 't', tool: 'kbagent_read', ok: true, preview: '[{"id":"1"}]' }, at: 1340 },
    { event: { type: 'tool.start', agent: 'kbc-sql-reviewer', callId: 's', tool: 'kbagent_sql', args: {} }, at: 1400 },
  ] as const;
  const run = steps.reduce((state, { event, at }) => reduceRun(state, event as never, at), initialRunState('lead'));

  it('shows every step with its kind, actor, status and duration', () => {
    render(<StepRows steps={run.activities} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Поручение');
    expect(rows[0]).toHaveTextContent('lead → sql-reviewer');
    expect(rows[1]).toHaveTextContent('Чтение');
    expect(rows[1]).toHaveTextContent('List configs');
    expect(rows[1]).toHaveTextContent('Готово');
    expect(rows[1]).toHaveTextContent('240 ms');
    expect(rows[2]).toHaveTextContent('SQL');
    expect(rows[2]).toHaveTextContent('Идёт');
  });

  it('expands a step into its arguments and result', async () => {
    render(<StepRows steps={run.activities} />);
    const [, toolRow] = screen.getAllByRole('button');
    await userEvent.click(toolRow as HTMLElement);
    expect(toolRow).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"list"/)).toBeInTheDocument();
    expect(screen.getByText('[{"id":"1"}]')).toBeInTheDocument();
    await userEvent.click(toolRow as HTMLElement);
    expect(screen.queryByText(/"list"/)).toBeNull();
  });

  it('shows an agent plan as a checklist with its progress', async () => {
    const todos = [
      { content: 'Map the project', status: 'completed' },
      { content: 'Document Shop 01', status: 'in_progress' },
      { content: 'Write the glossary', status: 'pending' },
    ];
    const state = reduceRun(initialRunState('lead'), { type: 'tool.start', agent: 'lead', callId: 'p', tool: 'write_todos', args: { todos } }, 1);
    render(<StepRows steps={state.activities} />);
    const row = screen.getByRole('button', { name: /План/ });
    expect(row).toHaveTextContent('1/3 · Document Shop 01');
    await userEvent.click(row);
    const items = within(screen.getByRole('list', { name: 'План' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Готово: Map the project', 'Идёт: Document Shop 01', 'Впереди: Write the glossary']);
  });

  it('renders nothing without steps', () => {
    const { container } = render(<StepRows steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
