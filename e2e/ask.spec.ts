import { PLAIN_REPLY } from './stub-llm/scenarios.mjs';
import { expect, lastReply, RU, test, withoutWebGL } from './support/test.ts';

test('a question from the home composer streams a reply and becomes a chat', async ({ page }) => {
  // The composer, not the 3D view, is under test here; home.spec.ts covers the aquarium.
  await withoutWebGL(page);
  const question = `Что умеет команда? ${Date.now()}`;
  await page.goto('/');
  await expect(page.getByTestId('aquarium-view')).toHaveClass(/fallback/);
  await page.getByRole('textbox', { name: 'Спросить команду' }).fill(question);
  await page.getByRole('button', { name: RU.send }).click();

  const drawer = page.locator('.ask__drawer');
  await expect(drawer.locator('.message--assistant')).toContainText(PLAIN_REPLY);
  await expect(drawer.locator('.message--pending')).toHaveCount(0);

  await drawer.getByRole('link', { name: 'Открыть чат' }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('navigation', { name: 'Чаты' }).getByRole('link', { name: question })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(question);
  await expect(page.locator('.conversation__messages .message--user')).toContainText(question);
  await expect(lastReply(page)).toContainText(PLAIN_REPLY);
});
