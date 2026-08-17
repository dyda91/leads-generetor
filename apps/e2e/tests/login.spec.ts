import { expect } from '@playwright/test';

import { test } from './fixtures';

/**
 * Public login-page coverage. These tests never perform a valid login, so they
 * never create a session and never revoke the journey's session (the app allows
 * only one active session per admin). They also keep the auth rate limit well
 * below the 10/min budget: exactly 2 invalid attempts here + 3 in the journey.
 */
test.describe('2. Login', () => {
  test('credenciais inválidas mostram mensagem uniforme e não autenticam', async ({
    page,
    adminCredentials,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await page.getByLabel('E-mail', { exact: true }).fill(adminCredentials.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-incorreta-123456');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('E-mail ou senha inválidos.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('nenhuma informação interna aparece no erro de login', async ({
    page,
    adminCredentials,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await page.getByLabel('E-mail', { exact: true }).fill(adminCredentials.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-incorreta-123456');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    const text = await alert.textContent();
    expect(text ?? '').not.toMatch(/requestId|stack|Prisma|SqlError| at /i);
    expect(text ?? '').not.toContain('/auth/login');
    expect(text ?? '').not.toContain(adminCredentials.email);
  });

  test('exatamente um h1 na página de login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acesse sua conta');
  });
});
