import { PLAIN_REPLY } from './stub-llm/scenarios.mjs';
import { expect, lastReply, test, withoutWebGL } from './support/test.ts';

/** Russian UI strings of the routines section (web/src/i18n/ru.ts). */
const SECTION = 'Регулярные задачи';
const SWITCH = 'Запускать по расписанию';
const RUN_NOW = 'Запустить сейчас';
const LATEST = 'Последние запуски по расписанию';

// The switches live in the app's data dir: put the shipped defaults back for the other specs.
test.afterEach(async ({ request }) => {
  for (const name of ['morning-check', 'profile-refresh']) {
    const response = await request.put(`/api/routines/${name}`, { data: { enabled: false } });
    expect(response.ok()).toBe(true);
  }
});

test('the shipped routines are off, and switching one on sticks after a reload', async ({ page }) => {
  await page.goto('/settings');
  const section = page.getByRole('region', { name: SECTION });
  const morning = section.getByRole('listitem', { name: 'Morning check' });
  await expect(morning).toContainText('По будням · 08:00');
  await expect(morning).toContainText('Не запланирована');
  await expect(section.getByRole('listitem', { name: 'Profile refresh' })).toContainText('пн · 07:00');

  const toggle = morning.getByRole('checkbox', { name: SWITCH });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(morning).toContainText('Следующий запуск');

  await page.reload();
  await expect(page.getByRole('region', { name: SECTION }).getByRole('listitem', { name: 'Morning check' }).getByRole('checkbox', { name: SWITCH })).toBeChecked();
});

test('run now opens a chat titled after the routine, and Home opens the run in the chat popup', async ({ page }) => {
  // The chats panel, not the 3D view, is under test on Home.
  await withoutWebGL(page);
  await page.goto('/settings');
  const refresh = page.getByRole('region', { name: SECTION }).getByRole('listitem', { name: 'Profile refresh' });
  await refresh.getByRole('button', { name: RUN_NOW }).click();

  const lastRun = refresh.getByRole('link', { name: /Последний запуск/ });
  await expect(lastRun).toBeVisible();
  const chat = await lastRun.getAttribute('href');
  await lastRun.click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Profile refresh · \d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('.conversation__messages .message--user')).toContainText('Scheduled routine "Profile refresh"');
  await expect(lastReply(page)).toContainText(PLAIN_REPLY);

  await page.goto('/');
  await page.getByRole('region', { name: 'Обзор' }).getByRole('button', { name: 'Чаты' }).click();
  const runs = page.getByRole('dialog', { name: 'Чаты' }).getByRole('region', { name: LATEST });
  await runs.getByRole('button', { name: /Profile refresh/ }).click();
  const popup = page.getByRole('dialog', { name: 'Чат' });
  await expect(popup.getByRole('heading', { level: 1 })).toHaveText(/^Profile refresh · \d{4}-\d{2}-\d{2}$/);
  await expect(popup.getByRole('link', { name: 'Открыть в чатах' })).toHaveAttribute('href', chat ?? '');
});
