import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { MODEL_ID } from './stub-llm/scenarios.mjs';
import { expect, test, withoutWebGL } from './support/test.ts';

// The suite runs without kbagent on PATH, so setup stops at step 4: the wizard is what Home shows.
const KEY = 'e2e-rotated-key-0042';

test('home shows the setup checklist in place of the survey offer while kbagent is missing', async ({ page }) => {
  await withoutWebGL(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Завершите настройку' });
  await expect(card).toBeVisible();

  const steps = card.getByRole('listitem');
  // Six setup steps and the Keboola access, which waits for a project.
  await expect(steps).toHaveCount(7);
  await expect(steps.nth(6)).toContainText('Что команде можно в Keboola');
  await expect(steps.nth(0)).toContainText('Готово');
  await expect(steps.nth(2)).toContainText(`${MODEL_ID} answered in`);
  const kbagent = steps.nth(3);
  await expect(kbagent).toContainText('Нужно сделать');
  await expect(kbagent).toContainText(/winget install|install\.sh/);
  await expect(kbagent.getByRole('button', { name: 'Копировать' })).toBeVisible();
  await expect(steps.nth(4)).toContainText('Ждёт предыдущих шагов.');
  await expect(page.getByRole('region', { name: 'Инициализация проекта' })).toHaveCount(0);
});

test('the model answers a test request through OmniRoute', async ({ request }) => {
  const response = await request.post('/api/setup/test-model');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ ok: true, model: MODEL_ID });
});

test('a new OmniRoute key from Settings goes to .env and never comes back', async ({ page }) => {
  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'Первый запуск' });
  const keyStep = section.getByRole('listitem', { name: /Ключ OmniRoute/ });
  await keyStep.getByRole('button', { name: 'Заменить ключ' }).click();
  const field = keyStep.getByLabel('API-ключ OmniRoute');
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill(KEY);

  const saved = page.waitForResponse((response) => response.url().endsWith('/api/setup/omniroute'));
  const rechecked = page.waitForResponse((response) => response.url().includes('/api/setup') && response.request().method() === 'GET');
  await keyStep.getByRole('button', { name: 'Сохранить ключ' }).click();

  const save = await saved;
  expect(save.status()).toBe(200);
  expect(save.request().url()).not.toContain(KEY);
  expect(await save.json()).toEqual({ baseUrl: expect.any(String), apiKeySet: true });
  expect(await (await rechecked).text()).not.toContain(KEY);
  await expect(keyStep.getByRole('button', { name: 'Заменить ключ' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(KEY);

  const envFile = process.env.E2E_ENV_FILE ?? '';
  expect(parseEnv(readFileSync(envFile, 'utf8')).OMNIROUTE_API_KEY).toBe(KEY);
  // Applied without a restart: the checklist that ran after saving already used the new key.
  await expect(section.getByRole('listitem', { name: /Модель отвечает/ })).toContainText(`${MODEL_ID} answered in`);
});
