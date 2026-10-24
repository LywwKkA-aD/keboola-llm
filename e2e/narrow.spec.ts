import type { Page } from '@playwright/test';
import { expect, test, withoutWebGL } from './support/test.ts';

/** Boxes meant to scroll sideways on a phone: the tabs, code and command blocks, the agents table, Markdown tables. */
const SIDEWAYS = ['.topbar__nav', 'pre', '.table', '.markdown table'].join(', ');

/**
 * What sticks out sideways: the document itself, or any scroll box (a page, a pane) whose content is wider
 * than the box, except the ones meant to scroll sideways.
 */
const overflowing = (page: Page) =>
  page.evaluate((sideways) => {
    const doc = document.documentElement;
    const boxes = [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
      const { overflowX } = getComputedStyle(element);
      return (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1 && !element.matches(sideways);
    });
    return [
      ...(doc.scrollWidth > doc.clientWidth ? [`document ${doc.scrollWidth}px`] : []),
      ...boxes.map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} ${element.scrollWidth}px > ${element.clientWidth}px`),
    ];
  }, SIDEWAYS);

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await withoutWebGL(page);
});

for (const [path, heading] of [
  ['/settings', 'Настройки студии'],
  ['/knowledge', 'Что знает команда'],
  ['/knowledge?tab=memory', 'Что знает команда'],
  ['/agents', 'Команда'],
] as const) {
  test(`${path} fits a phone screen without sideways scrolling`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1.page__title')).toContainText(heading);
    await page.waitForLoadState('networkidle');
    expect(await overflowing(page)).toEqual([]);
  });
}

test('the agent details drawer fits a phone screen', async ({ page }) => {
  await page.goto('/agents');
  await page.getByRole('button', { name: /^lead/ }).click();
  await expect(page.locator('aside.drawer')).toBeVisible();
  expect(await overflowing(page)).toEqual([]);
});
