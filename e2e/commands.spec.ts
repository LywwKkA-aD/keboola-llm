import { DELEGATE_REPLY } from './stub-llm/scenarios.mjs';
import { expect, lastReply, RU, test } from './support/test.ts';

test('a command picked from the menu reaches the lead and stays on the message after a reload', async ({ page }) => {
  await page.goto('/chat');
  const box = page.getByRole('textbox', { name: RU.chatPlaceholder });
  const menu = page.getByRole('listbox', { name: 'Команды' });

  await box.pressSequentially('/ag');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await box.press('Enter');
  await expect(box).toHaveValue('/agent ');
  await box.pressSequentially('knowledge');
  await menu.getByRole('option', { name: /knowledge-keeper/ }).click();
  await expect(box).toHaveValue('/agent knowledge-keeper ');
  await box.pressSequentially('e2e-delegate: что лежит в базе знаний?');
  await box.press('Enter');

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(lastReply(page)).toContainText(DELEGATE_REPLY);
  const question = page.locator('.conversation__messages .message--user').last();
  await expect(question.locator('.message__command')).toHaveText('/agent knowledge-keeper');
  await expect(question.locator('.message__plain')).toHaveText('e2e-delegate: что лежит в базе знаний?');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('e2e-delegate: что лежит в базе знаний?');

  // The history comes from the server's checkpoints: what the user typed, not the instruction the lead got.
  await page.reload();
  await expect(question.locator('.message__command')).toHaveText('/agent knowledge-keeper');
  await expect(question).not.toContainText('The user chose');
});

test('/sql switches the chat policy in place, without a run', async ({ page }) => {
  await page.goto('/chat');
  const box = page.getByRole('textbox', { name: RU.chatPlaceholder });
  await box.fill('Команда, привет');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(lastReply(page)).toBeVisible();

  const toggle = page.getByRole('checkbox', { name: 'Разрешить SQL в этом чате' });
  await expect(toggle).not.toBeChecked();
  await box.fill('/sql on');
  await box.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'SQL в этом чате разрешён.' })).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect(page.locator('.conversation__messages .message--user')).toHaveCount(1);
});
