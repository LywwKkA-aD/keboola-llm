import { useEffect } from 'react';
import { useLive } from '../live/live-context.tsx';
import { useSettings } from '../state/settings-context.tsx';
import { tabTitle } from './tab-title.ts';
import { useDesktopNotifications } from './useDesktopNotifications.ts';

/** Lets a user in another tab or app see that the team waits: the count in the tab title, and desktop notifications. */
export function Attention() {
  const { approvals } = useLive();
  const { t } = useSettings();
  const base = t('app.title');

  useEffect(() => {
    document.title = tabTitle(base, approvals.length);
    return () => {
      document.title = base;
    };
  }, [base, approvals.length]);

  useDesktopNotifications();
  return null;
}
