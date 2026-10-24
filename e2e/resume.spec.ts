import { STREAM_ERROR } from './stub-llm/chunks.mjs';
import { RESUMED_REPLY } from './stub-llm/scenarios.mjs';
import { expect, lastReply, RU, startChat, test } from './support/test.ts';

test('a run that broke off continues where it stopped', async ({ page }) => {
  const question = `e2e-fail-once: сколько заказов? ${Date.now()}`;
  await startChat(page, question);

  // The model's answer broke off mid-stream: the chat says why and offers to continue.
  const notice = page.getByRole('alert');
  await expect(notice).toContainText(RU.modelUnavailable);
  await expect(notice).toContainText(STREAM_ERROR.error.message);
  const chat = page.getByRole('navigation', { name: RU.chats }).getByRole('listitem').filter({ hasText: question });
  await expect(chat).toContainText(RU.interrupted);

  await notice.getByRole('button', { name: RU.continue }).click();

  await expect(lastReply(page)).toContainText(RESUMED_REPLY);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(chat).not.toContainText(RU.interrupted);
  // The run went on from its checkpoint: the question is in the chat once, not asked again.
  await expect(page.locator('.conversation__messages .message--user')).toHaveCount(1);
});
