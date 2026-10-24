import { useCallback, useEffect, useState } from 'react';
import { askNotifyPermission, type NotifyPermission, notifyPermission } from './browser.ts';

/** The notification permission of this browser, rechecked when the user comes back from its settings. */
export function useNotifyPermission(): readonly [NotifyPermission, () => Promise<NotifyPermission>] {
  const [permission, setPermission] = useState(notifyPermission);

  useEffect(() => {
    const sync = () => setPermission(notifyPermission());
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const ask = useCallback(async () => {
    const answer = await askNotifyPermission();
    setPermission(answer);
    return answer;
  }, []);

  return [permission, ask];
}
