import { existsSync, readFileSync } from 'node:fs';
import { APPROVED_REPLY, REJECTED_REPLY, SKILL_PATH } from './stub-llm/scenarios.mjs';
import { E2E_SKILL_FILE, removeE2eSkill } from './support/paths.ts';
import { expect, lastReply, RU, startChat, test, withoutWebGL } from './support/test.ts';

test.beforeEach(removeE2eSkill);
test.afterEach(removeE2eSkill);

test('approving on the approvals page lets agent-builder write the skill', async ({ page }) => {
  const title = `e2e-approval: создай скилл ${Date.now()}`;
  const chatUrl = await startChat(page, title);

  const card = page.getByRole('region', { name: RU.approval });
  await expect(card).toContainText('write_file');
  await expect(card).toContainText('agent-builder');
  await expect(card).toContainText(SKILL_PATH);
  expect(existsSync(E2E_SKILL_FILE)).toBe(false);

  await page.getByRole('navigation', { name: RU.appNav }).getByRole('link', { name: /^Подтверждения/ }).click();
  await page.getByRole('button', { name: title }).click();
  const detail = page.getByRole('region', { name: RU.approval });
  await expect(detail).toContainText('agent-builder');
  await expect(detail).toContainText(SKILL_PATH);
  await detail.getByRole('button', { name: RU.approve }).click();

  await expect.poll(() => existsSync(E2E_SKILL_FILE)).toBe(true);
  expect(readFileSync(E2E_SKILL_FILE, 'utf8')).toContain('name: e2e-skill');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);

  await page.goto(chatUrl);
  await expect(lastReply(page)).toContainText(APPROVED_REPLY);
  await expect(page.getByRole('region', { name: RU.approval })).toHaveCount(0);
});

// Rejects rather than approves: after a second write and removal of e2e-skill in one run, the server's file
// watcher misses history.spec's next re-creation of that folder.
test('rejecting from the approvals panel on Home leaves no file and the chat popup shows the report', async ({ page }) => {
  await withoutWebGL(page);
  const title = `e2e-approval: создай скилл с аквариума ${Date.now()}`;
  await startChat(page, title);
  await expect(page.getByRole('region', { name: RU.approval })).toContainText('write_file');

  await page.goto('/');
  await page.getByRole('region', { name: 'Обзор' }).getByRole('button', { name: /^Подтверждения [1-9]/ }).click();
  const panel = page.getByRole('dialog', { name: 'Подтверждения' });
  const entry = panel.locator('.mini-approval').filter({ hasText: title });
  await expect(entry).toContainText(SKILL_PATH);
  await entry.getByRole('button', { name: RU.reject }).click();
  await expect(entry).toHaveCount(0);

  // The chat opens in the popup over the aquarium, where the team reports the result.
  await page.getByRole('region', { name: 'Обзор' }).getByRole('button', { name: 'Чаты' }).click();
  await page.getByRole('dialog', { name: 'Чаты' }).getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByRole('dialog', { name: 'Чат' }).locator('.message--assistant').last()).toContainText(REJECTED_REPLY);
  expect(existsSync(E2E_SKILL_FILE)).toBe(false);
});

test('rejecting in the chat leaves no file and the team reports the rejection', async ({ page }) => {
  await startChat(page, 'e2e-approval: создай скилл, но я откажу');

  const card = page.getByRole('region', { name: RU.approval });
  await expect(card).toContainText('write_file');
  await card.getByRole('button', { name: RU.reject }).click();

  await expect(lastReply(page)).toContainText(REJECTED_REPLY);
  await expect(card).toHaveCount(0);
  expect(existsSync(E2E_SKILL_FILE)).toBe(false);
});
