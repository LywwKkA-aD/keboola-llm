import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { stubApi, stubEventSource } from '../../test-utils/fake-api.ts';
import { baseRoutes } from '../../test-utils/fixtures.ts';

const scrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe('TopBar', () => {
  it('scrolls the active tab into view, so it shows when the tabs scroll sideways on a phone', async () => {
    const scrolled: string[] = [];
    // happy-dom has no layout to scroll: record who asked instead.
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.textContent ?? '');
    });
    stubEventSource();
    stubApi(baseRoutes);
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await waitFor(() => expect(scrolled).toContain('Настройки'));

    await userEvent.click(screen.getByRole('link', { name: 'Знания' }));
    await waitFor(() => expect(scrolled.at(-1)).toBe('Знания'));
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});
