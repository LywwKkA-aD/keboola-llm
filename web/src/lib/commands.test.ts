import { describe, expect, it } from 'vitest';
import { type CommandContext, commandLabel, menuItems, parseInput } from './commands.ts';

const context: CommandContext = {
  skills: [
    { name: 'keboola-change', description: 'Change a project safely' },
    { name: 'project-survey', description: 'Map a project' },
  ],
  agents: [{ name: 'keboola-developer', description: 'Changes Keboola' }],
  local: new Set(['init', 'sql', 'new']),
};
const home: CommandContext = { ...context, local: new Set(['init']) };

const labels = (value: string, ctx = context) => menuItems(value, ctx).map((item) => item.label);

describe('menuItems', () => {
  it('lists every command the composer offers for a bare slash', () => {
    expect(labels('/')).toEqual(['/skill', '/agent', '/plan', '/init', '/sql', '/new', '/help']);
    expect(labels('/', home)).toEqual(['/skill', '/agent', '/plan', '/init', '/help']);
  });

  it('narrows the commands as the name is typed', () => {
    expect(labels('/s')).toEqual(['/skill', '/sql']);
    expect(labels('/pl')).toEqual(['/plan']);
    expect(labels('/zzz')).toEqual([]);
  });

  it('completes a command that takes more into "/name " and runs one that takes nothing at once', () => {
    const [skill] = menuItems('/sk', context);
    expect(skill).toMatchObject({ value: '/skill ', run: false, argHint: 'command.argSkill' });
    expect(menuItems('/he', context)[0]).toMatchObject({ value: '/help', run: true });
    expect(menuItems('/pla', context)[0]).toMatchObject({ value: '/plan ', run: false });
  });

  it('lists skills, agents and on/off as the argument, filtered by what is typed', () => {
    expect(labels('/skill ')).toEqual(['keboola-change', 'project-survey']);
    expect(labels('/skill survey')).toEqual(['project-survey']);
    expect(menuItems('/skill survey', context)[0]).toMatchObject({ value: '/skill project-survey ', help: { text: 'Map a project' } });
    expect(labels('/agent ')).toEqual(['keboola-developer']);
    expect(menuItems('/sql o', context).map((item) => [item.value, item.run])).toEqual([
      ['/sql on', true],
      ['/sql off', true],
    ]);
  });

  it('closes once the argument is chosen or for plain text', () => {
    expect(labels('/skill keboola-change ')).toEqual([]);
    expect(labels('Where is customer_id used?')).toEqual([]);
    expect(labels('/plan ')).toEqual([]);
    expect(labels('/sql on', home)).toEqual([]);
  });
});

describe('parseInput', () => {
  it('sends plain text, paths and unknown commands as typed', () => {
    expect(parseInput('  Count orders ', context)).toEqual({ kind: 'send', text: 'Count orders' });
    expect(parseInput('/knowledge/notes.md what is this?', context)).toEqual({ kind: 'send', text: '/knowledge/notes.md what is this?' });
    expect(parseInput('/deploy now', context)).toEqual({ kind: 'send', text: '/deploy now' });
    expect(parseInput('/new', home)).toEqual({ kind: 'send', text: '/new' });
  });

  it('sends /skill with or without a request, /agent and /plan with one', () => {
    expect(parseInput('/skill keboola-change Fix the join\nin orders', context)).toEqual({
      kind: 'send',
      text: 'Fix the join\nin orders',
      command: { name: 'skill', arg: 'keboola-change' },
    });
    expect(parseInput('/skill project-survey', context)).toEqual({ kind: 'send', text: '', command: { name: 'skill', arg: 'project-survey' } });
    expect(parseInput('/agent keboola-developer Fix it', context)).toEqual({ kind: 'send', text: 'Fix it', command: { name: 'agent', arg: 'keboola-developer' } });
    expect(parseInput('/plan Rebuild the model', context)).toEqual({ kind: 'send', text: 'Rebuild the model', command: { name: 'plan' } });
  });

  it('explains what is missing or wrong instead of sending', () => {
    expect(parseInput('/skill', context)).toEqual({ kind: 'error', key: 'command.needSkill' });
    expect(parseInput('/skill ghost do it', context)).toEqual({ kind: 'error', key: 'command.unknownSkill', name: 'ghost' });
    expect(parseInput('/agent', context)).toEqual({ kind: 'error', key: 'command.needAgent' });
    expect(parseInput('/agent lead do it', context)).toEqual({ kind: 'error', key: 'command.unknownAgent', name: 'lead' });
    expect(parseInput('/agent keboola-developer', context)).toEqual({ kind: 'error', key: 'command.needText', name: '/agent keboola-developer' });
    expect(parseInput('/plan', context)).toEqual({ kind: 'error', key: 'command.needText', name: '/plan' });
    expect(parseInput('/sql maybe', context)).toEqual({ kind: 'error', key: 'command.sqlUsage' });
  });

  it('carries out the app-side commands', () => {
    expect(parseInput('/sql on', context)).toEqual({ kind: 'sql', allow: true });
    expect(parseInput('/sql off', context)).toEqual({ kind: 'sql', allow: false });
    expect(parseInput('/init', context)).toEqual({ kind: 'init' });
    expect(parseInput('/new', context)).toEqual({ kind: 'new' });
    expect(parseInput('/help', home)).toEqual({ kind: 'help' });
  });

  it('labels a command the way it is typed', () => {
    expect(commandLabel({ name: 'agent', arg: 'keboola-developer' })).toBe('/agent keboola-developer');
    expect(commandLabel({ name: 'plan' })).toBe('/plan');
  });
});
