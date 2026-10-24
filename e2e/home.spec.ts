import { MODEL_ID } from './stub-llm/scenarios.mjs';
import { expect, RU, test, withoutWebGL } from './support/test.ts';

// Software WebGL needs seconds to build the scene; the 3D assertions get room for that.
const SCENE = { timeout: 30_000 };
test.describe.configure({ timeout: 60_000 });

test('home is the 3D aquarium edge to edge with the HUD and the team panel over it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  const nav = page.getByRole('navigation', { name: RU.appNav });
  for (const name of ['Аквариум', 'Чаты', 'Агенты', 'Подтверждения', 'Настройки']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.locator('.topbar__live')).toHaveText('Онлайн');
  await expect(page.locator('.topbar__status')).toContainText(MODEL_ID);

  const aquarium = page.getByTestId('aquarium-view');
  await expect(aquarium).not.toHaveClass(/fallback/);
  await expect(aquarium.locator('canvas')).toBeVisible(SCENE);
  // Station labels are DOM overlays of the scene: they appear once three.js is up.
  await expect(aquarium.getByText('LEAD', { exact: true })).toBeVisible(SCENE);
  // No side columns: the scene spans the whole width under the top bar.
  expect((await aquarium.boundingBox())?.width).toBe(page.viewportSize()?.width);

  const hud = page.getByRole('region', { name: 'Обзор' });
  await hud.getByRole('button', { name: 'Команда' }).click();
  const team = page.getByRole('dialog', { name: 'Команда' });
  for (const name of ['lead', 'knowledge-keeper', 'agent-builder']) {
    await expect(team.getByText(name, { exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(team).toHaveCount(0);
});

test('on a phone the home page fits the width and panels open as bottom sheets', async ({ page }) => {
  // The layout, not the 3D view, is under test here.
  await withoutWebGL(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('region', { name: 'Обзор' }).getByRole('button', { name: 'Чаты' }).click();
  const chats = page.getByRole('dialog', { name: 'Чаты' });
  await expect(chats).toBeVisible();
  const sheet = await chats.boundingBox();
  expect(sheet?.x).toBe(0);
  expect(sheet?.width).toBe(390);
  expect(Math.round((sheet?.y ?? 0) + (sheet?.height ?? 0))).toBe(844);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test('leaving the aquarium tears the 3D view down without page errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('aquarium-view').getByText('LEAD', { exact: true })).toBeVisible(SCENE);

  await page.getByRole('navigation', { name: RU.appNav }).getByRole('link', { name: 'Чаты' }).click();
  // Tearing the scene down shares the main thread with software WebGL: same budget as building it.
  await expect(page.getByRole('button', { name: 'Новый чат' })).toBeVisible(SCENE);
  await expect(page.getByTestId('aquarium-view')).toHaveCount(0);
  // The pageErrors fixture fails the test if unmounting the scene threw.
});
