import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition } from '../hooks/useAnchoredPosition.ts';

export type SelectOption<T extends string> = readonly [value: T, label: string];

/** Letters typed within this window build one search string; after it a new search starts. */
const TYPEAHEAD_RESET_MS = 600;

/** Rough list height per option and for its padding and border (select.css), to decide where it fits. */
const OPTION_HEIGHT = 32;
const LIST_CHROME = 10;

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp']);

const isPrintable = (event: KeyboardEvent) => event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;

/** Index of the first label after `from` (wrapping around) that starts with `query`, or -1. */
export function findByPrefix(labels: readonly string[], from: number, query: string): number {
  const needle = query.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step++) {
    const index = (from + step + labels.length) % labels.length;
    if (labels[index]?.toLocaleLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

/**
 * A select styled like the rest of the app, following the WAI-ARIA select-only combobox pattern: focus
 * stays on the control and aria-activedescendant points into a listbox rendered in a portal.
 */
export function Select<T extends string>({ value, options, onChange, id, className, disabled = false, ...naming }: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const control = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const open = isOpen && !disabled;
  const position = useAnchoredPosition(control, open, options.length * OPTION_HEIGHT + LIST_CHROME);
  const selected = options.findIndex(([option]) => option === value);
  const current = Math.min(active, options.length - 1);
  const last = options.length - 1;

  const show = (index = selected) => {
    setActive(Math.max(index, 0));
    setOpen(true);
  };

  const choose = (index: number) => {
    setOpen(false);
    const option = options[index];
    if (option && option[0] !== value) onChange(option[0]);
  };

  // A repeated letter cycles through the options starting with it; different letters narrow the prefix.
  const typeahead = (letter: string, from: number) => {
    const now = Date.now();
    const text = now - typed.current.at > TYPEAHEAD_RESET_MS ? letter : typed.current.text + letter;
    typed.current = { text, at: now };
    const labels = options.map(([, label]) => label);
    const repeated = [...text].every((char) => char === letter);
    return repeated ? findByPrefix(labels, from, letter) : findByPrefix(labels, from - 1, text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!open) {
      if (OPEN_KEYS.has(key)) show();
      else if (key === 'Home') show(0);
      else if (key === 'End') show(last);
      else if (isPrintable(event)) {
        const match = typeahead(key, selected);
        show(match >= 0 ? match : selected);
      } else return;
      event.preventDefault();
      return;
    }
    if (key === 'ArrowDown') setActive(Math.min(current + 1, last));
    else if (key === 'ArrowUp') setActive(Math.max(current - 1, 0));
    else if (key === 'Home') setActive(0);
    else if (key === 'End') setActive(last);
    else if (key === 'Enter' || key === ' ') choose(current);
    else if (key === 'Escape') setOpen(false);
    else if (isPrintable(event)) {
      const match = typeahead(key, current);
      if (match >= 0) setActive(match);
    } else return;
    event.preventDefault();
  };

  // Close on a press anywhere outside the control and its list.
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!control.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Scroll only the list (never the page) to keep the active option visible.
  const placed = position !== undefined;
  useLayoutEffect(() => {
    const box = list.current;
    const item = box?.children[current] as HTMLElement | undefined;
    if (!box || !item) return;
    if (item.offsetTop < box.scrollTop) box.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = item.offsetTop + item.offsetHeight - box.clientHeight;
  }, [current, placed]);

  return (
    <>
      <button
        ref={control}
        type="button"
        id={id}
        role="combobox"
        className={className ? `select ${className}` : 'select'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && current >= 0 ? optionId(current) : undefined}
        disabled={disabled}
        {...naming}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        // Space activates buttons on keyup; it already opened or chose on keydown.
        onKeyUp={(event) => event.key === ' ' && event.preventDefault()}
      >
        <span className="select__value">{options[selected]?.[1] ?? value}</span>
        <svg className="select__chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        position &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className="select-list"
            style={position}
            {...naming}
            // Keep focus on the control while the list is clicked or scrolled.
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map(([option, label], index) => (
              <li
                key={option}
                id={optionId(index)}
                role="option"
                aria-selected={option === value}
                className={`select-list__option${index === current ? ' select-list__option--active' : ''}`}
                onMouseMove={() => index !== current && setActive(index)}
                onClick={() => choose(index)}
              >
                <span className="select-list__label">{label}</span>
                {option === value && (
                  <svg className="select-list__check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
