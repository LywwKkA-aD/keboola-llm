import { PLAIN_REPLY } from './stub-llm/scenarios.mjs';
import { expect, lastReply, RU, test, withoutWebGL } from './support/test.ts';

test('a question from the home composer opens the new chat in the popup over the aquarium', async ({ page }) => {
  // The composer, not the 3D view, is under test here; home.spec.ts covers the aquarium.
  await withoutWebGL(page);
  const question = `Что умеет команда? ${Date.now()}`;
  await page.goto('/');
  await expect(page.getByTestId('aquarium-view')).toHaveClass(/fallback/);
  await page.getByRole('textbox', { name: 'Спросить команду' }).fill(question);
  await page.getByRole('button', { name: RU.send }).click();

  const popup = page.getByRole('dialog', { name: 'Чат' });
  await expect(popup.getByRole('heading', { level: 1 })).toHaveText(question);
  await expect(popup.locator('.message--user')).toContainText(question);
  await expect(popup.locator('.message--assistant').last()).toContainText(PLAIN_REPLY);
  await expect(popup.locator('.message--pending')).toHaveCount(0);
  // Still on Home, the aquarium next to the chat.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('aquarium-view')).toBeVisible();

  await popup.getByRole('link', { name: 'Открыть в чатах' }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('navigation', { name: 'Чаты' }).getByRole('link', { name: question })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(question);
  await expect(page.locator('.conversation__messages .message--user')).toContainText(question);
  await expect(lastReply(page)).toContainText(PLAIN_REPLY);
});
