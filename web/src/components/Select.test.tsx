import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { anchoredStyle } from '../hooks/useAnchoredPosition.ts';
import { Select } from './Select.tsx';

type Fruit = 'apple' | 'banana' | 'cherry' | 'chestnut' | 'date';

const FRUITS: readonly (readonly [Fruit, string])[] = [
  ['apple', 'Apple'],
  ['banana', 'Banana'],
  ['cherry', 'Cherry'],
  ['chestnut', 'Chestnut'],
  ['date', 'Date'],
];

/** A controlled Select, like the pages use it, with a spy on every change. */
function Harness({ initial = 'banana', onChange = () => {}, disabled = false }: { initial?: Fruit; onChange?: (value: Fruit) => void; disabled?: boolean }) {
  const [value, setValue] = useState<Fruit>(initial);
  return (
    <div>
      <Select<Fruit>
        aria-label="Fruit"
        value={value}
        options={FRUITS}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
      <button type="button">Next field</button>
      <p>Outside</p>
    </div>
  );
}

const combobox = () => screen.getByRole('combobox', { name: 'Fruit' });
const activeOption = () => document.getElementById(combobox().getAttribute('aria-activedescendant') ?? '');

describe('Select', () => {
  it('renders a closed select-only combobox showing the chosen label', () => {
    render(<Harness />);
    const control = combobox();

    expect(control).toHaveTextContent('Banana');
    expect(control).toHaveAttribute('aria-haspopup', 'listbox');
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAttribute('aria-controls');
    expect(control).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('takes its accessible name from aria-labelledby too', () => {
    render(
      <>
        <span id="fruit-label">Favourite fruit</span>
        <Select aria-labelledby="fruit-label" value="apple" options={FRUITS} onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Favourite fruit' })).toHaveTextContent('Apple');
  });

  it('opens on click into a listbox that marks the chosen option, and closes on a second click', async () => {
    render(<Harness />);
    await userEvent.click(combobox());

    const listbox = screen.getByRole('listbox');
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(combobox()).toHaveAttribute('aria-controls', listbox.id);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Apple', 'Banana', 'Cherry', 'Chestnut', 'Date']);
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'Banana' }));

    await userEvent.click(combobox());
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders the open list outside the control, so scrolling parents cannot clip it', async () => {
    const { container } = render(<Harness />);
    await userEvent.click(combobox());
    expect(container.contains(screen.getByRole('listbox'))).toBe(false);
  });

  it('chooses a clicked option, closes and keeps focus on the control', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(combobox());
    await userEvent.click(screen.getByRole('option', { name: 'Date' }));

    expect(onChange).toHaveBeenCalledWith('date');
    expect(combobox()).toHaveTextContent('Date');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).toHaveFocus();
  });

  it('does not report a change when the chosen option is picked again', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(combobox());
    await userEvent.click(screen.getByRole('option', { name: 'Banana' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it.each(['{ArrowDown}', '{ArrowUp}', '{Enter}', ' '])('opens with %s on the chosen option', async (key) => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combobox().focus();
    await userEvent.keyboard(key);

    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(activeOption()).toHaveTextContent('Banana');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moves the active option with the arrows, Home and End, and chooses it with Enter', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combobox().focus();
    await userEvent.keyboard('{ArrowDown}');

    await userEvent.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Cherry');
    await userEvent.keyboard('{End}');
    expect(activeOption()).toHaveTextContent('Date');
    await userEvent.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Date');
    await userEvent.keyboard('{Home}');
    expect(activeOption()).toHaveTextContent('Apple');
    await userEvent.keyboard('{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Apple');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('cherry');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).toHaveTextContent('Cherry');
    expect(combobox()).toHaveFocus();
  });

  it('chooses the active option with Space', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combobox().focus();
    await userEvent.keyboard(' {ArrowUp} ');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('apple');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape without choosing and keeps focus on the control', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combobox().focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).not.toHaveAttribute('aria-activedescendant');
    expect(combobox()).toHaveTextContent('Banana');
    expect(combobox()).toHaveFocus();
  });

  it('closes on Tab and lets focus move on', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combobox().focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next field' })).toHaveFocus();
  });

  it('closes on a click outside without choosing', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(combobox());
    await userEvent.click(screen.getByText('Outside'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('follows the mouse with the active option', async () => {
    render(<Harness />);
    await userEvent.click(combobox());
    await userEvent.hover(screen.getByRole('option', { name: 'Chestnut' }));
    expect(activeOption()).toHaveTextContent('Chestnut');
  });

  it('jumps to the next option matching typed letters, opening the list when needed', async () => {
    render(<Harness />);
    combobox().focus();

    await userEvent.keyboard('c');
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(activeOption()).toHaveTextContent('Cherry');
    await userEvent.keyboard('c');
    expect(activeOption()).toHaveTextContent('Chestnut');
    await userEvent.keyboard('c');
    expect(activeOption()).toHaveTextContent('Cherry');
  });

  it('matches several typed letters as a prefix', async () => {
    render(<Harness initial="apple" />);
    combobox().focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('che');
    expect(activeOption()).toHaveTextContent('Cherry');
    await userEvent.keyboard('s');
    expect(activeOption()).toHaveTextContent('Chestnut');
  });

  it('ignores clicks and keys when disabled', async () => {
    render(<Harness disabled />);
    expect(combobox()).toBeDisabled();
    await userEvent.click(combobox());
    combobox().focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a new value given by the parent', () => {
    const { rerender } = render(<Select aria-label="Fruit" value="apple" options={FRUITS} onChange={() => {}} />);
    rerender(<Select aria-label="Fruit" value="date" options={FRUITS} onChange={() => {}} />);
    expect(combobox()).toHaveTextContent('Date');
  });
});

describe('anchoredStyle', () => {
  const rect = (top: number, height = 36) => ({ top, bottom: top + height, left: 40, width: 300 });

  it('opens below the control, capped in height', () => {
    expect(anchoredStyle(rect(100), 900)).toEqual({ top: 140, left: 40, width: 300, maxHeight: 320 });
  });

  it('shrinks to the room left below', () => {
    expect(anchoredStyle(rect(600), 900)).toEqual({ top: 640, left: 40, width: 300, maxHeight: 252 });
  });

  it('flips above the control when there is little room below and more above', () => {
    expect(anchoredStyle(rect(800), 900)).toEqual({ bottom: 104, left: 40, width: 300, maxHeight: 320 });
    expect(anchoredStyle(rect(800), 900, 100)).toEqual({ bottom: 104, left: 40, width: 300, maxHeight: 320 });
  });

  it('keeps a short list below when it fits there', () => {
    expect(anchoredStyle(rect(800), 900, 42)).toEqual({ top: 840, left: 40, width: 300, maxHeight: 52 });
  });
});
