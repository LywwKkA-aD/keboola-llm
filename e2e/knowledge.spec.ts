import type { Page } from '@playwright/test';
import { expect, startChat, test } from './support/test.ts';

const notes = (page: Page) => page.getByRole('complementary');

test('a note written on the Knowledge page is edited, seen by the agents and deleted', async ({ page }) => {
  await page.goto('/knowledge');
  // The first start seeds the knowledge base in the data dir with a README.
  await expect(notes(page).getByRole('button', { name: /README\.md/ })).toBeVisible();

  await page.getByRole('button', { name: 'Новая заметка' }).click();
  await page.getByRole('textbox', { name: 'Путь' }).fill('how-to/e2e-note');
  await page.getByRole('textbox', { name: 'Markdown' }).fill('# E2E заметка\n\nКак **выкатить** флоу.');
  await expect(page.getByText('Есть несохранённые изменения')).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить' }).click();

  const note = page.getByRole('article', { name: 'how-to/e2e-note.md' });
  await expect(note.getByRole('heading', { name: 'E2E заметка' })).toBeVisible();
  await expect(page).toHaveURL(/note=how-to%2Fe2e-note\.md/);

  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.getByRole('textbox', { name: 'Markdown' }).fill('# E2E заметка\n\nВторая версия.');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(note).toContainText('Вторая версия.');
  await page.reload();
  await expect(page.getByRole('article', { name: 'how-to/e2e-note.md' })).toContainText('Вторая версия.');

  // The agents read the same folder as /knowledge/.
  await startChat(page, 'e2e-delegate: что лежит в базе знаний?');
  const listing = page.getByRole('region', { name: 'Шаги' }).getByRole('listitem').filter({ hasText: 'knowledge-keeper ls' });
  await expect(listing).toContainText('Готово');
  await listing.getByRole('button').click();
  await expect(listing).toContainText('/knowledge/how-to/');

  await page.goto('/knowledge?note=how-to%2Fe2e-note.md');
  await page.getByRole('button', { name: 'Удалить' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Удалить заметку?' });
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(notes(page).getByRole('button', { name: /E2E заметка/ })).toHaveCount(0);
  await expect(page.getByText('Выберите заметку слева или создайте новую.')).toBeVisible();
});

test('the shared memory is edited on the Memory tab and kept', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Открыть на странице «Знания»' }).click();
  await expect(page.getByRole('tab', { name: 'Память' })).toHaveAttribute('aria-selected', 'true');

  const memory = page.getByRole('article', { name: 'AGENTS.md' });
  await expect(memory.getByRole('heading', { name: 'Shared memory' })).toBeVisible();
  await memory.getByRole('button', { name: 'Изменить' }).click();
  const source = page.getByRole('textbox', { name: 'Markdown' });
  await source.fill(`${await source.inputValue()}\n- E2E: пользователь любит CTE\n`);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Сохранено')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('article', { name: 'AGENTS.md' })).toContainText('E2E: пользователь любит CTE');
  await expect(page.getByText('Ни один проект ещё не изучен.')).toBeVisible();
});
