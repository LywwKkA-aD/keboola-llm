import type { StringKey } from '../i18n/strings.ts';
import type { Signal } from '../live/signals.ts';

/** A desktop notification, built from names only: no tool arguments, SQL or results ever go in. */
export interface Notice {
  readonly title: string;
  readonly body: string;
  /** One notification per chat: a newer one replaces the older. */
  readonly tag: string;
  readonly threadId: string;
}

export interface NoticeContext {
  /** Undefined when the chat list could not be read. */
  readonly chatTitle: string | undefined;
  /** The chat is a run of a scheduled routine. */
  readonly routine: boolean;
  readonly lead: string;
}

const BODY: Record<Signal['kind'], StringKey> = {
  approval: 'notify.approval',
  finished: 'notify.finished',
  failed: 'notify.failed',
};

export function noticeFor(signal: Signal, { chatTitle, routine, lead }: NoticeContext, t: (key: StringKey) => string): Notice {
  const key = routine && signal.kind === 'finished' ? 'notify.routineFinished' : BODY[signal.kind];
  return {
    title: chatTitle || t('app.title'),
    body: t(key).replace('{agent}', signal.agent || lead),
    tag: `chat:${signal.threadId}`,
    threadId: signal.threadId,
  };
}
