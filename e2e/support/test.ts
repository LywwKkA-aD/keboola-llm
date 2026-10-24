import { test as base, expect, type Page } from '@playwright/test';

export { expect };

/** Every test fails on an uncaught error in the page, wherever it happens. */
export const test = base.extend<{ pageErrors: Error[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await use(errors);
      expect(errors.map((error) => error.message), 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

/** Russian UI strings the specs look for (web/src/i18n/ru.ts). */
export const RU = {
  appNav: 'Agent Studio',
  chatPlaceholder: 'Сообщение команде. Enter отправляет, Shift+Enter переносит строку.',
  send: 'Отправить',
  approval: 'Нужно подтверждение',
  approve: 'Разрешить',
  reject: 'Отклонить',
  steps: 'Шаги',
  chats: 'Чаты',
  continue: 'Продолжить',
  interrupted: 'Прервано',
  modelUnavailable: 'Модель не ответила: она перегружена или недоступна.',
} as const;

/** Start a chat from the Chats page; resolves once the browser is on the new chat. */
export async function startChat(page: Page, text: string): Promise<string> {
  await page.goto('/chat');
  await page.getByRole('textbox', { name: RU.chatPlaceholder }).fill(text);
  await page.getByRole('button', { name: RU.send }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  return page.url();
}

/**
 * Make the page see no WebGL, so the aquarium shows its fallback. Software WebGL in headless Chromium
 * keeps the main thread busy for seconds, which only slows specs that are not about the 3D view.
 */
export async function withoutWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.includes('webgl') ? null : getContext.call(this, type, ...rest);
    } as typeof getContext;
  });
}

/** The last reply of the team in the open chat. */
export const lastReply = (page: Page) => page.locator('.conversation__messages .message--assistant').last();
