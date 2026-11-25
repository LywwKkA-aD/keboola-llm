import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import type { ChatEntry } from '../api/types.ts';
import { FakeEventSource, stubApi, stubEventSource } from '../test-utils/fake-api.ts';
import { baseRoutes, THREADS } from '../test-utils/fixtures.ts';

// Counts how often Markdown is parsed: the expensive part of rendering a long chat.
const parsed = vi.hoisted(() => ({ count: 0 }));
vi.mock('react-markdown', () => ({
  default: ({ children }: { children?: ReactNode }) => {
    parsed.count += 1;
    return <div>{children}</div>;
  },
}));

const history: ChatEntry[] = Array.from({ length: 8 }, (_, i) => [
  { id: `u${i}`, role: 'user' as const, text: `Вопрос ${i}` },
  { id: `a${i}`, role: 'assistant' as const, text: `## Ответ ${i}` },
]).flat();

beforeEach(() => {
  stubEventSource();
  parsed.count = 0;
});

describe('rendering a long chat while the team streams', () => {
  it('parses only the streaming answer on each token, not the whole chat', async () => {
    stubApi({ ...baseRoutes, 'GET /api/threads/t1/messages': history });
    window.history.pushState({}, '', '/chat/t1');
    render(<App />);
    await screen.findByText('Вопрос 7', { selector: '.message__plain' });
    const source = FakeEventSource.forThread('t1');
    act(() => source.emit({ type: 'run.started', runId: 'r' }));

    const before = parsed.count;
    for (let i = 0; i < 10; i += 1) act(() => source.emit({ type: 'token', agent: 'lead', text: 'x' }));
    // One parse per token for the streaming bubble; the 8 answers above stay as they are.
    expect(parsed.count - before).toBeLessThanOrEqual(10);
  });

  it('follows the answer only while the user is at the bottom', async () => {
    stubApi({ ...baseRoutes, 'GET /api/threads/t1/messages': history });
    window.history.pushState({}, '', '/chat/t1');
    render(<App />);
    await screen.findByText('Вопрос 7', { selector: '.message__plain' });
    const source = FakeEventSource.forThread('t1');
    const box = document.querySelector('.conversation__messages') as HTMLElement;
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const at = (top: number) => {
      Object.defineProperties(box, { scrollHeight: { value: 2000, configurable: true }, clientHeight: { value: 500, configurable: true } });
      box.scrollTop = top;
      box.dispatchEvent(new Event('scroll'));
    };

    at(200); // scrolled up to read
    scrolled.mockClear();
    act(() => {
      source.emit({ type: 'run.started', runId: 'r' });
      source.emit({ type: 'token', agent: 'lead', text: 'Считаю' });
    });
    expect(scrolled).not.toHaveBeenCalled();

    at(1500); // back at the bottom
    act(() => source.emit({ type: 'token', agent: 'lead', text: '...' }));
    expect(scrolled).toHaveBeenCalled();
    scrolled.mockRestore();
  });

  it('leaves the Home chat popup alone when other chats stream', async () => {
    stubApi({ ...baseRoutes, 'GET /api/threads/t1/messages': history, 'GET /api/threads': THREADS });
    window.history.pushState({}, '', '/');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Чаты' }));
    await userEvent.click(await screen.findByRole('button', { name: /Где используется customer_id/ }));
    await screen.findByText('Вопрос 7', { selector: '.message__plain' });

    const before = parsed.count;
    for (let i = 0; i < 10; i += 1) act(() => FakeEventSource.global().emit({ type: 'token', agent: 'keboola-expert', text: 'x' }, 't2'));
    expect(parsed.count - before).toBe(0);
  });
});
