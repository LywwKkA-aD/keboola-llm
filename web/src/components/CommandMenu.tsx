import { useEffect } from 'react';
import type { CommandNote } from '../hooks/useCommandField.ts';
import type { CommandMenu as Menu } from '../hooks/useCommandMenu.ts';
import { useSettings } from '../state/settings-context.tsx';

/** The command menu over a composer; mouse picks keep the focus in the text field. */
export function CommandMenu({ menu }: { menu: Menu }) {
  const { t } = useSettings();
  const activeId = menu.open ? menu.optionId(menu.active) : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  if (!menu.open) return null;
  return (
    <ul id={menu.listId} className="command-menu" role="listbox" aria-label={t('command.menu')}>
      {menu.items.map((item, index) => (
        <li
          key={item.key}
          id={menu.optionId(index)}
          role="option"
          aria-selected={index === menu.active}
          className={`command-menu__item${index === menu.active ? ' command-menu__item--on' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => menu.hover(index)}
          onClick={() => menu.pick(index)}
        >
          <span className="command-menu__name mono">
            {item.label}
            {item.argHint && <span className="command-menu__arg"> {t(item.argHint)}</span>}
          </span>
          <span className="command-menu__help">{'key' in item.help ? t(item.help.key) : item.help.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A line over the composer: what a command did, or why it was not sent. */
export function CommandNoteLine({ note }: { note: CommandNote | undefined }) {
  if (!note) return null;
  return (
    <p className={`command-note${note.tone === 'error' ? ' command-note--error' : ''}`} role={note.tone === 'error' ? 'alert' : 'status'}>
      {note.text}
    </p>
  );
}
