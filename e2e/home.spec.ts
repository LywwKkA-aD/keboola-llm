import { MODEL_ID } from './stub-llm/scenarios.mjs';
import { expect, RU, test } from './support/test.ts';

// Software WebGL needs seconds to build the scene; the 3D assertions get room for that.
const SCENE = { timeout: 30_000 };
test.describe.configure({ timeout: 60_000 });

test('home renders the shell, the team and the 3D aquarium', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  const nav = page.getByRole('navigation', { name: RU.appNav });
  for (const name of ['Аквариум', 'Чаты', 'Агенты', 'Подтверждения', 'Настройки']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.locator('.topbar__live')).toHaveText('Онлайн');
  await expect(page.locator('.topbar__status')).toContainText(MODEL_ID);

  const team = page.getByRole('navigation', { name: 'Команда' });
  for (const name of ['lead', 'knowledge-keeper', 'agent-builder']) {
    await expect(team.getByText(name, { exact: true })).toBeVisible();
  }

  const aquarium = page.getByTestId('aquarium-view');
  await expect(aquarium).not.toHaveClass(/fallback/);
  await expect(aquarium.locator('canvas')).toBeVisible(SCENE);
  // Station labels are DOM overlays of the scene: they appear once three.js is up.
  await expect(aquarium.getByText('LEAD', { exact: true })).toBeVisible(SCENE);
});

test('leaving the aquarium tears the 3D view down without page errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('aquarium-view').getByText('LEAD', { exact: true })).toBeVisible(SCENE);

  await page.getByRole('navigation', { name: RU.appNav }).getByRole('link', { name: 'Чаты' }).click();
  await expect(page.getByRole('button', { name: 'Новый чат' })).toBeVisible();
  await expect(page.getByTestId('aquarium-view')).toHaveCount(0);
  // The pageErrors fixture fails the test if unmounting the scene threw.
});
