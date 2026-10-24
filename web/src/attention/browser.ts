import type { Notice } from './notice.ts';

/** The browser's notification permission; 'unsupported' where there is no Notification API. */
export type NotifyPermission = NotificationPermission | 'unsupported';

const notificationApi = (): typeof Notification | undefined => (typeof Notification === 'undefined' ? undefined : Notification);

export const notifyPermission = (): NotifyPermission => notificationApi()?.permission ?? 'unsupported';

/** Ask once; a browser that already decided answers at once without a prompt. */
export async function askNotifyPermission(): Promise<NotifyPermission> {
  const api = notificationApi();
  if (!api) return 'unsupported';
  if (api.permission !== 'default') return api.permission;
  try {
    return await api.requestPermission();
  } catch {
    return api.permission;
  }
}

/** Show a notice if the browser allows it; clicking it runs onClick and closes it. */
export function showNotice(notice: Notice, onClick: () => void): Notification | undefined {
  const api = notificationApi();
  if (api?.permission !== 'granted') return undefined;
  try {
    const notification = new api(notice.title, { body: notice.body, tag: notice.tag });
    notification.onclick = () => {
      onClick();
      notification.close();
    };
    return notification;
  } catch {
    // Chrome on Android only shows notifications through a service worker.
    return undefined;
  }
}
