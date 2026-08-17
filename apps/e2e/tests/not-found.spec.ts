import { expect } from '@playwright/test';

import { test } from './fixtures';

test.describe('8. Página 404 pública', () => {
  test('rota desconhecida mostra página 404 controlada sem revelar pathname', async ({ page }) => {
    await page.goto('/rota/desconhecida/segredo');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();

    const body = await page.locator('body').textContent();
    expect(body ?? '').not.toContain('rota/desconhecida');
    expect(body ?? '').not.toContain('segredo');
    expect(body ?? '').not.toContain('Segurança da conta');
    expect(body ?? '').not.toContain('Dashboard');
  });

  test('404 não revela rotas internas nem stack', async ({ page }) => {
    await page.goto('/nao-existe');
    const body = await page.locator('body').textContent();
    expect(body ?? '').not.toMatch(/at .*\(|Error:|TypeError|undefined is not a function/i);
  });

  test('link para o início segue a política de autenticação', async ({ page }) => {
    await page.goto('/nao-existe');
    await page.getByRole('link', { name: 'Ir para o início' }).click();
    // Sem sessão, / redireciona para /login.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  });

  test('404 não usa o AppShell autenticado', async ({ page }) => {
    await page.goto('/nao-existe');
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
  });
});
