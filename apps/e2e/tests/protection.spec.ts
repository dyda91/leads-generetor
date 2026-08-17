import { expect } from '@playwright/test';

import { test } from './fixtures';

test.describe('1. Proteção inicial', () => {
  test('acesso anônimo a / redireciona para /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  });

  test('acesso anônimo a /settings/security redireciona para /login', async ({ page }) => {
    await page.goto('/settings/security');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  });

  test('conteúdo protegido não pisca durante o redirecionamento', async ({ page }) => {
    await page.goto('/');
    // O conteúdo protegido (Dashboard) nunca deve ficar visível para anônimos.
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
  });
});
