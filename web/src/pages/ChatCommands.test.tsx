import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes } from '../test-utils/fixtures.ts';

async function openChat(routes: Record<string, unknown> = {}) {
  const api = stubApi({ ...baseRoutes, ...routes });
  window.history.pushState({}, '', '/chat/t1');
  render(<App />);
  await screen.findByText('Где используется customer_id?', { selector: '.message__plain' });
  // The team (skills, agents) arrives after the history; the menu is built from it.
  await waitFor(() => expect(api.callsTo('GET', '/api/team').length).toBeGreaterThan(0));
  return api;
}

const box = () => screen.getByRole('textbox', { name: /Сообщение команде/ });
const menu = () => screen.queryByRole('listbox', { name: 'Команды' });
const options = () => within(menu() as HTMLElement).getAllByRole('option').map((option) => option.querySelector('.command-menu__name')?.textContent);

beforeEach(() => {
  stubEventSource();
});

describe('Chat commands', () => {
  it('opens the menu on "/" and narrows it as the name is typed; Escape hides it', async () => {
    await openChat();
    await userEvent.type(box(), '/');
    expect(options()).toEqual(['/skill <навык>', '/agent <агент>', '/plan', '/init', '/sql on | off', '/new', '/help']);
    expect(box()).toHaveAttribute('aria-activedescendant', within(menu() as HTMLElement).getAllByRole('option')[0]?.id);

    await userEvent.type(box(), 's');
    expect(options()).toEqual(['/skill <навык>', '/sql on | off']);
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(box()).toHaveValue('/s');
  });

  it('completes a command and its agent from the keyboard and sends them with the request', async () => {
    const api = await openChat({ 'POST /api/threads/t1/messages': { runId: 'r2' } });
    await userEvent.type(box(), '/ag{Enter}');
    expect(box()).toHaveValue('/agent ');
    expect(options()).toEqual(['keboola-expert']);
    await userEvent.keyboard('{Enter}');
    expect(box()).toHaveValue('/agent keboola-expert ');

    await userEvent.type(box(), 'Почему упал джоб?{Enter}');
    expect(api.callsTo('POST', '/api/threads/t1/messages')[0]?.body).toEqual({ text: 'Почему упал джоб?', command: { name: 'agent', arg: 'keboola-expert' } });
    const bubble = screen.getByText('Почему упал джоб?', { selector: '.message__plain' }).closest('.message');
    expect(bubble).toHaveTextContent('/agent keboola-expert');
    expect(box()).toHaveValue('');
  });

  it('moves through the menu with the arrows and picks with the mouse', async () => {
    await openChat();
    await userEvent.type(box(), '/');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(within(menu() as HTMLElement).getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(within(menu() as HTMLElement).getAllByRole('option')[6]).toHaveAttribute('aria-selected', 'true');

    await userEvent.clear(box());
    await userEvent.type(box(), '/skill ');
    await userEvent.click(within(menu() as HTMLElement).getByRole('option', { name: /kbagent/ }));
    expect(box()).toHaveValue('/skill kbagent ');
    expect(box()).toHaveFocus();
  });

  it('says what is wrong instead of sending a command the team cannot follow', async () => {
    const api = await openChat();
    await userEvent.type(box(), '/agent component-builder Собери компонент');
    await userEvent.keyboard('{Escape}{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет активного агента «component-builder»');
    expect(api.callsTo('POST', '/api/threads/t1/messages')).toHaveLength(0);
  });

  it('sends paths and unknown words with a slash as plain text', async () => {
    const api = await openChat({ 'POST /api/threads/t1/messages': { runId: 'r2' } });
    await userEvent.type(box(), '/memories/AGENTS.md что там?{Enter}');
    expect(api.callsTo('POST', '/api/threads/t1/messages')[0]?.body).toEqual({ text: '/memories/AGENTS.md что там?' });
  });

  it('switches SQL for the chat with /sql, without a message to the team', async () => {
    const api = await openChat({ 'PUT /api/threads/t1/policy': (body: unknown) => body });
    await userEvent.type(box(), '/sql on{Enter}');
    expect(api.callsTo('PUT', '/api/threads/t1/policy')[0]?.body).toEqual({ allowSql: true });
    expect(await screen.findByRole('status')).toHaveTextContent('SQL в этом чате разрешён.');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Разрешить SQL в этом чате' })).toBeChecked());
    expect(api.callsTo('POST', '/api/threads/t1/messages')).toHaveLength(0);
  });

  it('lists the commands for /help and opens a new chat for /new', async () => {
    await openChat();
    await userEvent.type(box(), '/help{Enter}');
    expect(box()).toHaveValue('/');
    expect(options()).toHaveLength(7);

    await userEvent.clear(box());
    await userEvent.type(box(), '/new{Enter}');
    await waitFor(() => expect(window.location.pathname).toBe('/chat'));
  });

  it('starts the init workspace for /init and opens its chat', async () => {
    const api = await openChat({
      'GET /api/onboarding': { project: 'sandbox', profiled: true, running: false },
      'POST /api/onboarding/start': { threadId: 't2' },
    });
    await userEvent.type(box(), '/init{Enter}');
    await waitFor(() => expect(window.location.pathname).toBe('/chat/t2'));
    expect(api.callsTo('POST', '/api/onboarding/start')[0]?.body).toEqual({ text: expect.stringContaining('sandbox') });
  });

  it('shows a message sent with a command as typed, with the command on top', async () => {
    await openChat({
      'GET /api/threads/t1/messages': [
        { id: 'h1', role: 'user', text: 'Где используется customer_id?' },
        { id: 'h2', role: 'user', text: '', command: { name: 'skill', arg: 'kbagent' } },
      ],
    });
    expect(screen.getByText('/skill kbagent')).toHaveClass('message__command');
  });
});
