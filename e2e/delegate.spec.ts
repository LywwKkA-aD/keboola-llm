import { DELEGATE_REPLY } from './stub-llm/scenarios.mjs';
import { expect, lastReply, RU, startChat, test } from './support/test.ts';

test('the lead delegates to the knowledge keeper and the steps show it', async ({ page }) => {
  await startChat(page, 'e2e-delegate: что лежит в базе знаний?');

  await expect(lastReply(page)).toContainText(DELEGATE_REPLY);
  const steps = page.getByRole('region', { name: RU.steps }).getByRole('listitem');
  const delegation = steps.filter({ hasText: 'Поручение' });
  await expect(delegation).toContainText('lead');
  await expect(delegation).toContainText('→ knowledge-keeper');
  await expect(delegation).toContainText('готово');

  const listing = steps.filter({ hasText: 'knowledge-keeper ls' });
  await expect(listing).toContainText('готово');
  await listing.getByRole('button').click();
  await expect(listing).toContainText('/knowledge');
});
