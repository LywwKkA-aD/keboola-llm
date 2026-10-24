import type { Page } from '@playwright/test';
import { SKILL_PATH } from './stub-llm/scenarios.mjs';
import { removeE2eSkill } from './support/paths.ts';
import { expect, RU, test, withoutWebGL } from './support/test.ts';

interface ShownNotice {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
}

interface FakeWindow {
  notices: { title: string; options: NotificationOptions; onclick: (() => void) | null }[];
  setHidden: (hidden: boolean) => void;
}

/**
 * The browser's side, faked before the app loads: notifications are allowed and recorded instead of shown,
 * and the test decides whether the tab is hidden (another tab or app in front).
 */
async function fakeBrowser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fake = window as unknown as FakeWindow;
    let hidden = false;
    fake.notices = [];
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    fake.setHidden = (next) => {
      hidden = next;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    class RecordedNotification {
      static readonly permission = 'granted';
      static readonly requestPermission = async () => 'granted';
      readonly title: string;
      readonly options: NotificationOptions;
      onclick: (() => void) | null = null;

      constructor(title: string, options: NotificationOptions = {}) {
        this.title = title;
        this.options = options;
        fake.notices.push(this);
      }

      close(): void {}
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: RecordedNotification });
  });
}

const notices = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as FakeWindow).notices.map((notice): ShownNotice => ({ title: notice.title, body: notice.options.body ?? '', tag: notice.options.tag ?? '' })),
  );
const setHidden = (page: Page, hidden: boolean) => page.evaluate((value) => (window as unknown as FakeWindow).setHidden(value), hidden);

test.beforeEach(async ({ page, request }) => {
  removeE2eSkill();
  expect((await request.put('/api/settings', { data: { desktopNotifications: true } })).ok()).toBe(true);
  await withoutWebGL(page);
  await fakeBrowser(page);
});

test.afterEach(async ({ request }) => {
  removeE2eSkill();
  expect((await request.put('/api/settings', { data: { desktopNotifications: false } })).ok()).toBe(true);
});

test('a hidden tab counts the waiting approval in its title and gets one notification that opens the chat', async ({ page, request }) => {
  await page.goto('/settings');
  await expect(page).toHaveTitle('Agent Studio');
  await expect(page.getByRole('checkbox', { name: 'Уведомления на рабочем столе' })).toBeChecked();
  await setHidden(page, true);

  const created = await request.post('/api/threads', { data: { text: `e2e-approval: создай скилл ${Date.now()}` } });
  expect(created.ok()).toBe(true);
  const { thread } = (await created.json()) as { thread: { id: string; title: string } };

  await expect(page).toHaveTitle('(1) Agent Studio');
  await expect.poll(() => notices(page)).toEqual([{ title: thread.title, body: 'agent-builder ждёт вашего подтверждения', tag: `chat:${thread.id}` }]);
  expect(JSON.stringify(await notices(page))).not.toContain(SKILL_PATH);

  await page.evaluate(() => (window as unknown as FakeWindow).notices[0]?.onclick?.());
  await expect(page).toHaveURL(new RegExp(`/chat/${thread.id}$`));
  await setHidden(page, false);

  await page.getByRole('region', { name: RU.approval }).getByRole('button', { name: RU.reject }).click();
  await expect(page).toHaveTitle('Agent Studio');
  // Back in the tab: the rejected run's end is not announced.
  expect(await notices(page)).toHaveLength(1);
});

test('a routine run that finishes while the tab is hidden is announced as a routine', async ({ page }) => {
  await page.goto('/settings');
  const refresh = page.getByRole('region', { name: 'Регулярные задачи' }).getByRole('listitem', { name: 'Profile refresh' });
  await expect(refresh).toBeVisible();
  await setHidden(page, true);
  await refresh.getByRole('button', { name: 'Запустить сейчас' }).click();

  await expect.poll(() => notices(page)).toHaveLength(1);
  const [notice] = await notices(page);
  expect(notice?.title).toMatch(/^Profile refresh · \d{4}-\d{2}-\d{2}$/);
  expect(notice?.body).toBe('lead выполнил регулярную задачу');
});
