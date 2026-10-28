import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PLAIN_REPLY } from './stub-llm/scenarios.mjs';
import { E2E_SKILL_DIR, E2E_SKILL_FILE, removeE2eSkill } from './support/paths.ts';
import { expect, lastReply, test } from './support/test.ts';

const skill = (body: string) => `---\nname: e2e-skill\ndescription: Written by the end-to-end tests; safe to delete.\n---\n\n${body}\n`;
const FIRST = skill('First version of the e2e skill.');
const SECOND = skill('Second version, edited outside the app.');

test.beforeEach(removeE2eSkill);
test.afterEach(removeE2eSkill);

test('a skill edited on disk gets a history and an older version can be restored', async ({ page }) => {
  await page.goto('/agents?tab=skills');
  mkdirSync(E2E_SKILL_DIR, { recursive: true });
  writeFileSync(E2E_SKILL_FILE, FIRST);
  // The file watcher reloads the team and the page refetches it: no page reload. Wait for the skill's row in the team
  // (with its description): until the reload, an earlier spec's e2e-skill shows under removed definitions instead.
  await page.getByRole('button', { name: /^e2e-skill Written by the end-to-end tests/ }).click();
  const drawer = page.getByRole('complementary', { name: 'e2e-skill' });
  const history = drawer.getByRole('region', { name: 'История' });
  await expect(history.getByRole('button').first()).toContainText('Создан');

  writeFileSync(E2E_SKILL_FILE, SECOND);
  await expect(history.getByRole('button').first()).toContainText('Изменён');

  await history.getByRole('button').nth(1).click();
  const diff = history.getByRole('list', { name: /Версия \d+/ });
  await expect(diff).toContainText('-Second version, edited outside the app.');
  await expect(diff).toContainText('+First version of the e2e skill.');

  await history.getByRole('button', { name: 'Восстановить эту версию' }).click();
  const question = history.getByRole('group', { name: 'Восстановить эту версию' });
  await expect(question).toContainText('Заменить текущий файл');
  await question.getByRole('button', { name: 'Восстановить', exact: true }).click();

  await expect(history.getByText('Восстановлено. Команда подхватит изменение через мгновение.')).toBeVisible();
  await expect.poll(() => readFileSync(E2E_SKILL_FILE, 'utf8')).toBe(FIRST);
  await expect(history.getByRole('button').first()).toContainText('Восстановлен');
});

test('the drawer explains a disabled agent and checks an enabled one through the lead', async ({ page }) => {
  await page.goto('/agents');
  await page.getByRole('button', { name: /^component-builder/ }).click();
  const disabled = page.getByRole('complementary', { name: 'component-builder' });
  await expect(disabled.getByText('Почему выключен')).toBeVisible();
  await expect(disabled).toContainText('needs a shell, file writes, uv, Docker and git');
  await expect(disabled.getByRole('button', { name: 'Проверить агента' })).toHaveCount(0);
  await disabled.getByRole('button', { name: 'Закрыть' }).click();

  await page.getByRole('button', { name: /^knowledge-keeper/ }).click();
  const drawer = page.getByRole('complementary', { name: 'knowledge-keeper' });
  await drawer.getByRole('button', { name: 'Проверить агента' }).click();
  await expect(drawer.getByText('Проверка закончена.')).toBeVisible();
  await drawer.getByRole('link', { name: 'Открыть чат' }).click();

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Проверка агента «knowledge-keeper».' })).toBeVisible();
  await expect(lastReply(page)).toContainText(PLAIN_REPLY);
});
