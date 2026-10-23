import { Link } from 'react-router';
import type { StringKey } from '../../i18n/strings.ts';
import { formatClock } from '../../lib/format.ts';
import type { FeedItem } from '../../live/live-state.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { shortName } from './mood.ts';

const KIND_CHIP: Record<FeedItem['kind'], [StringKey, string]> = {
  delegate: ['kind.delegate', 'chip--blue'],
  tool: ['kind.tool', ''],
  approval: ['approval.title', 'chip--amber'],
  auto: ['kind.auto', 'chip--green'],
  error: ['status.failed', 'chip--red'],
};

/** Compact newest-first list of what agents did, linking to the chat it happened in. */
export function FeedList({ items, empty }: { items: readonly FeedItem[]; empty: string }) {
  const { t, settings } = useSettings();
  if (items.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ol className="feed">
      {items.map((item) => {
        const [chipKey, chipClass] = KIND_CHIP[item.kind];
        return (
          <li key={item.id} className="feed__item">
            <time className="feed__time mono">{formatClock(item.at, settings.language)}</time>
            <div className="feed__body">
              <div className="feed__head">
                <span className={`chip ${chipClass}`}>{t(chipKey)}</span>
                {item.agent && <span className="feed__agent">{shortName(item.agent)}</span>}
                {item.target && <span className="feed__target mono">{shortName(item.target)}</span>}
              </div>
              {item.text && (
                <Link className="feed__text" to={`/chat/${item.threadId}`}>
                  {item.text}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
