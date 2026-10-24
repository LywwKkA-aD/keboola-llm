import type { StringKey } from '../../i18n/strings.ts';
import { actionBadge, actionStatus, actionTitle } from '../../lib/actions.ts';
import { formatClock } from '../../lib/format.ts';
import type { FeedItem } from '../../live/live-state.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import './actions.css';

/** The chip and the words of a row: what was done ("Edit") and on what; approvals and failures keep their kind. */
function rowText(item: FeedItem, viewer: string, t: (key: StringKey) => string) {
  const badge = actionBadge(item);
  const title = actionTitle(item, viewer);
  const verb = title.verb ? t(title.verb) : '';
  if (item.kind === 'tool' || item.kind === 'delegate') return { badge, chip: verb || t(badge.key), text: title.text };
  return { badge, chip: t(badge.key), text: [verb, title.text].filter(Boolean).join(' ') };
}

/** An agent's recent actions, newest first; each opens its detail. */
export function ActionList({ items, viewer, label, onOpen }: { items: readonly FeedItem[]; viewer: string; label: string; onOpen: (id: string) => void }) {
  const { t, settings } = useSettings();
  const { approvals } = useLive();
  if (items.length === 0) return <p className="empty">{t('action.none')}</p>;
  return (
    <ol className="actions" aria-label={label}>
      {items.map((item) => {
        const { badge, chip, text } = rowText(item, viewer, t);
        const status = actionStatus(item, approvals);
        return (
          <li key={item.id}>
            <button type="button" className="action-row" onClick={() => onOpen(item.id)}>
              <time className="action-row__time mono">{formatClock(item.at, settings.language)}</time>
              <span className={`chip${badge.tone ? ` chip--${badge.tone}` : ''} action-row__chip`}>{chip}</span>
              <span className="action-row__text">{text}</span>
              <span className={`action-status action-status--${status}`}>
                <span className="action-status__label">{t(`action.${status}` as StringKey)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
