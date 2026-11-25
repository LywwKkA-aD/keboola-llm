import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PARALLEL_REPLY } from './stub-llm/scenarios.mjs';
import { PARALLEL_SKILL_DIRS, removeParallelSkills } from './support/paths.ts';
import { expect, lastReply, RU, startChat, test } from './support/test.ts';

test.beforeEach(removeParallelSkills);
test.afterEach(removeParallelSkills);

const written = (index: number) => existsSync(join(PARALLEL_SKILL_DIRS[index] as string, 'SKILL.md'));

// What the analyst ran into: two agents wait at once, and each approval is answered on its own, from the chat and
// from the Approvals page. Neither answer fails, the chat never shows a stale card, and the run goes on after both.
test('two agents waiting at once: each approval is answered on its own, wherever', async ({ page }) => {
  const title = `e2e-parallel: два агента ${Date.now()}`;
  const chatUrl = await startChat(page, title);

  const cards = page.getByRole('region', { name: RU.approval });
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('button', { name: RU.send })).toBeDisabled();

  // The first one in the chat.
  await cards.filter({ hasText: 'e2e-par-a' }).getByRole('button', { name: RU.approve }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('e2e-par-b');
  await expect(page.getByText(/is not waiting|Answers must cover|уже решено/)).toHaveCount(0);
  expect(written(0)).toBe(false);

  // The second one on the Approvals page: only it is left there.
  await page.getByRole('navigation', { name: RU.appNav }).getByRole('link', { name: /^Подтверждения/ }).click();
  await expect(page.getByRole('button', { name: title })).toHaveCount(1);
  await page.getByRole('button', { name: title }).click();
  const detail = page.getByRole('region', { name: RU.approval });
  await expect(detail).toContainText('e2e-par-b');
  await detail.getByRole('button', { name: RU.reject }).click();
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);

  // The run resumed with both answers: one skill written, the other not.
  await expect.poll(() => written(0)).toBe(true);
  expect(written(1)).toBe(false);
  await page.goto(chatUrl);
  await expect(lastReply(page)).toContainText(PARALLEL_REPLY);
  await expect(page.getByRole('region', { name: RU.approval })).toHaveCount(0);
});
