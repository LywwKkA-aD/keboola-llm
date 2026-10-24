import { expect, RU, test } from './support/test.ts';

// Settings live on the server; put the defaults back so other specs see the Russian dark UI.
test.afterEach(async ({ request }) => {
  const response = await request.put('/api/settings', { data: { language: 'ru', theme: 'dark' } });
  expect(response.ok()).toBe(true);
});

test('switching to English and the light theme sticks after a reload', async ({ page }) => {
  const html = page.locator('html');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Настройки студии' })).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('combobox', { name: 'Язык ответов и интерфейса' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Studio settings' })).toBeVisible();
  await expect(html).toHaveAttribute('lang', 'en');

  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Studio settings' })).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('navigation', { name: RU.appNav }).getByRole('link', { name: 'Chats' })).toBeVisible();
});
