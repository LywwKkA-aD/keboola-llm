import { describe, expect, it, vi } from 'vitest';
import { FakeNotification, stubNotification } from '../test-utils/fake-notification.ts';
import { askNotifyPermission, showNotice } from './browser.ts';

const NOTICE = { title: 'Chat', body: 'lead has finished, the answer is ready', tag: 'chat:t1', threadId: 't1' };

describe('browser notifications', () => {
  it('keeps the current answer when the permission prompt fails', async () => {
    stubNotification('default');
    FakeNotification.requestPermission.mockRejectedValueOnce(new Error('no prompt here'));
    expect(await askNotifyPermission()).toBe('default');
  });

  it('shows nothing, and does not throw, where the browser refuses to build a notification', () => {
    vi.stubGlobal(
      'Notification',
      class {
        static readonly permission = 'granted';
        constructor() {
          throw new TypeError('Illegal constructor');
        }
      },
    );
    expect(showNotice(NOTICE, () => {})).toBeUndefined();
  });
});
