import { type KeyboardEvent, useId, useState } from 'react';
import { type CommandContext, type MenuItem, menuItems } from '../lib/commands.ts';

export interface CommandMenu {
  readonly items: readonly MenuItem[];
  readonly open: boolean;
  readonly active: number;
  readonly listId: string;
  readonly optionId: (index: number) => string;
  /** ARIA for the text field the menu belongs to (it stays a textbox; the menu is its listbox). */
  readonly fieldProps: {
    readonly 'aria-autocomplete': 'list';
    readonly 'aria-controls'?: string;
    readonly 'aria-activedescendant'?: string;
  };
  readonly hover: (index: number) => void;
  readonly pick: (index: number) => void;
  /** Arrows, Tab, Enter and Escape while the menu is open; true when the key was the menu's. */
  readonly onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * The menu of commands under a composer, like Claude Code's: it opens on "/" at the start, narrows as you type, and
 * Enter or a click takes the highlighted item (Tab only completes it). Escape hides it until the text changes.
 */
export function useCommandMenu({ value, context, onChange, onRun }: {
  value: string;
  context: CommandContext;
  onChange: (value: string) => void;
  /** Carry out a command that needs nothing more (e.g. /help, /sql on). */
  onRun: (value: string) => void;
}): CommandMenu {
  const id = useId();
  const [dismissed, setDismissed] = useState<string>();
  // The highlight belongs to the text it was moved for: typing starts again at the top.
  const [cursor, setCursor] = useState({ value: '', index: 0 });
  const items = menuItems(value, context);
  const open = items.length > 0 && dismissed !== value;
  const active = cursor.value === value ? Math.min(cursor.index, items.length - 1) : 0;
  const optionId = (index: number) => `${id}-option-${index}`;

  const pick = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (item.run) onRun(item.value);
    else onChange(item.value);
  };

  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (!open) return false;
    const move = (step: number) => setCursor({ value, index: (active + step + items.length) % items.length });
    switch (event.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Tab':
        onChange(items[active]?.value ?? value);
        break;
      case 'Enter':
        if (event.shiftKey || event.nativeEvent.isComposing) return false;
        pick(active);
        break;
      case 'Escape':
        setDismissed(value);
        break;
      default:
        return false;
    }
    // Escape too: it closes the menu only, not the chat popup or panel around the composer.
    event.preventDefault();
    return true;
  };

  return {
    items,
    open,
    active,
    listId: `${id}-list`,
    optionId,
    fieldProps: { 'aria-autocomplete': 'list', ...(open ? { 'aria-controls': `${id}-list`, 'aria-activedescendant': optionId(active) } : {}) },
    hover: (index) => setCursor({ value, index }),
    pick,
    onKeyDown,
  };
}
