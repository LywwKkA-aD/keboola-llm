import { existsSync, readFileSync } from 'node:fs';
import { APPROVED_REPLY, REJECTED_REPLY, SKILL_PATH } from './stub-llm/scenarios.mjs';
import { E2E_SKILL_FILE, removeE2eSkill } from './support/paths.ts';
import { expect, lastReply, RU, startChat, test } from './support/test.ts';

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

test('rejecting in the chat leaves no file and the team reports the rejection', async ({ page }) => {
  await startChat(page, 'e2e-approval: создай скилл, но я откажу');

  const card = page.getByRole('region', { name: RU.approval });
  await expect(card).toContainText('write_file');
  await card.getByRole('button', { name: RU.reject }).click();

  await expect(lastReply(page)).toContainText(REJECTED_REPLY);
  await expect(card).toHaveCount(0);
  expect(existsSync(E2E_SKILL_FILE)).toBe(false);
});
