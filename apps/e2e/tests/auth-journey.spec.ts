import { expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { collectApiRequests, fillLogin, isBusinessRequest, openMobileDrawer } from './helpers';
import { test } from './fixtures';
import { WEB_URL } from '../setup/paths';

const NEW_PASSWORD_PREFIX = `E2E-new-${randomBytes(6).toString('hex')}-Aa1!`;
const NEW_PASSWORD = `${NEW_PASSWORD_PREFIX}${randomBytes(8).toString('base64url')}`;

/**
 * Serial authenticated journey. The application enforces a single active
 * session per admin and a strict auth rate limit (10/min for login and
 * change-password on the same IP+UA). Every successful login revokes the
 * previous session, a password change rotates (and re-issues) the current one,
 * and logout is destructive. Those three properties make the authenticated
 * flows inherently stateful, so they run in ONE test with explicit steps in
 * dependency order instead of multiple tests that would revoke each other's
 * sessions or exceed the rate limit. No other test performs a valid login or a
 * logout, so no session is ever revoked by another test.
 *
 * Login budget of this suite (all below 10/min on a single IP):
 * - journey step "login": 1 valid login (covers "valid credentials
 *   authenticate", "password never in URL" and "destination restore");
 * - journey step "new password valid": 1 valid login;
 * - journey step "old password invalid": 1 invalid login;
 * - login.spec: 2 invalid logins.
 * Total POST /auth/login = 5 (2 valid, 3 invalid); change-password = 1. The
 * two local validation blocks never call the API.
 */
test.describe('Fluxo autenticado (jornada serial)', () => {
  test('jornada autenticada completa em ordem serial', async ({ browser, adminCredentials }) => {
    const ctx = await browser.newContext({ baseURL: WEB_URL });
    const page = await ctx.newPage();
    try {
      await test.step('login restaura o destino interno e nunca expõe a senha', async () => {
        // Anonymous access to a protected route keeps the internal destination
        // and redirects to /login; after login the destination is restored.
        await page.goto('/settings/security');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();

        await fillLogin(page, adminCredentials.email, adminCredentials.password);
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
        await expect(page).toHaveURL(/\/settings\/security$/);

        expect(page.url()).not.toContain(adminCredentials.password);
        expect(page.url()).not.toMatch(/password|senha|credential/i);
      });

      await test.step('dashboard vazio honesto e sem chamadas de negócio', async () => {
        const requests = collectApiRequests(page);
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

        await expect(
          page.getByRole('heading', { name: 'Nenhuma pesquisa realizada' }),
        ).toBeVisible();
        const cta = page.getByRole('button', { name: 'Pesquisar empresas' });
        await expect(cta).toBeDisabled();

        const body = await page.locator('body').textContent();
        expect(body ?? '').not.toMatch(/\d+\s*(leads|empresas|resultados)/i);
        expect(body ?? '').not.toMatch(/%|convers|gráfico|gráficos/i);
        expect(body ?? '').not.toContain('ADMIN');

        // Observable state: session restoration hits /auth/me, then nothing else
        // may fire; only requests with the exact E2E API origin are considered.
        await expect.poll(() => requests().length, { timeout: 5_000 }).toBeGreaterThan(0);
        await page.waitForLoadState('networkidle');
        const business = requests().filter((url) => isBusinessRequest(url));
        expect(business).toHaveLength(0);
      });

      await test.step('layout desktop: sidebar, navegação, skip link e main único', async () => {
        await page.goto('/');
        const aside = page.getByRole('complementary', { name: 'Menu lateral' });
        await expect(aside).toBeVisible();
        await expect(aside.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
        await expect(aside.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
          'aria-current',
          'page',
        );

        const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
        await expect(skip).toBeVisible();
        await expect(skip).toHaveAttribute('href', '#main-content');
        await expect(page.locator('main')).toHaveAttribute('id', 'main-content');

        await page.getByRole('link', { name: 'Segurança' }).click();
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
        await page.getByRole('link', { name: 'Dashboard' }).click();
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

        await page.goto('/settings/security');
        await expect(aside.getByRole('link', { name: 'Segurança' })).toHaveAttribute(
          'aria-current',
          'page',
        );

        await page.goto('/');
        await expect(page.locator('main')).toHaveCount(1);
      });

      await test.step('drawer mobile: gatilho, diálogo, Escape e item ativo', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Abrir menu de navegação' })).toBeVisible();
        await expect(page.getByRole('complementary', { name: 'Menu lateral' })).toBeHidden();

        let dialog = await openMobileDrawer(page);
        await expect(dialog.getByRole('link', { name: 'Dashboard' })).toBeVisible();
        await dialog.getByRole('link', { name: 'Segurança' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();

        const trigger = page.getByRole('button', { name: 'Abrir menu de navegação' });
        await trigger.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(trigger).toBeFocused();

        await page.goto('/settings/security');
        dialog = await openMobileDrawer(page);
        await expect(dialog.getByRole('link', { name: 'Segurança' })).toHaveAttribute(
          'aria-current',
          'page',
        );
      });

      await test.step('responsividade: sem rolagem horizontal e estrutura única', async () => {
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          await page.goto('/');
          const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
          });
          expect(hasHorizontalScroll).toBe(false);
        }

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Abrir menu de navegação' })).toBeVisible();
        await expect(page.getByRole('main')).toBeVisible();

        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto('/');
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
      });

      await test.step('restauração: reload mantém sessão, cookie seguro, sem storage', async () => {
        await page.goto('/settings/security');
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
        await expect(page.getByRole('complementary')).toBeVisible();

        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
        await expect(page).toHaveURL(/\/$/);

        const cookies = await ctx.cookies();
        const sessionCookie = cookies.find((cookie) => cookie.name === 'leads_session');
        expect(sessionCookie, 'expected leads_session cookie').toBeTruthy();
        expect(sessionCookie?.httpOnly).toBe(true);
        expect(sessionCookie?.sameSite).toBe('Strict');
        expect(sessionCookie?.path).toBe('/');
        expect(sessionCookie?.secure).toBe(false);

        const storage = await page.evaluate(() => ({
          localStorageKeys: Object.keys(window.localStorage),
          sessionStorageKeys: Object.keys(window.sessionStorage),
        }));
        expect(storage.localStorageKeys).toHaveLength(0);
        expect(storage.sessionStorageKeys).toHaveLength(0);
      });

      await test.step('segurança: validações locais bloqueiam antes da API', async () => {
        await page.goto('/settings/security');
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();

        // Divergent confirmation is rejected locally without calling the API.
        await fillChangePassword(
          page,
          adminCredentials.password,
          NEW_PASSWORD,
          `${NEW_PASSWORD}-diferente`,
        );
        await expect(page.getByText('A confirmação não coincide com a nova senha.')).toBeVisible();
        await expect(page).toHaveURL(/\/settings\/security$/);

        // A policy-violating password is not submitted.
        await fillChangePassword(page, adminCredentials.password, 'curta', 'curta');
        await expect(page.getByText(/pelo menos 12 caracteres/)).toBeVisible();
        await expect(page).toHaveURL(/\/settings\/security$/);
      });

      await test.step('troca de senha válida mantém a sessão e nunca expõe a senha', async () => {
        await fillChangePassword(page, adminCredentials.password, NEW_PASSWORD, NEW_PASSWORD);
        await expect(page.getByText('Senha alterada com sucesso.')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();

        expect(page.url()).not.toContain(NEW_PASSWORD);
        expect(page.url()).not.toContain(adminCredentials.password);
        expect(page.url()).not.toMatch(/password|senha/i);

        // The current session survives the rotation and survives a reload.
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
      });

      await test.step('a senha antiga deixa de autenticar', async () => {
        await expectInvalidLogin(browser, adminCredentials.email, adminCredentials.password);
      });

      await test.step('logout é destrutivo: redireciona, remove cookie e não volta', async () => {
        await page.goto('/settings/security');
        await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();

        await page.getByRole('button', { name: 'Sair' }).click();
        await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);

        const cookies = await ctx.cookies();
        expect(cookies.find((cookie) => cookie.name === 'leads_session')).toBeUndefined();

        await page.goBack();
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);

        await page.reload();
        await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
      });

      await test.step('a nova senha autentica após o logout', async () => {
        await expectValidLogin(browser, adminCredentials.email, NEW_PASSWORD);
      });
    } finally {
      await ctx.close();
    }
  });
});

async function fillChangePassword(
  page: Page,
  current: string,
  next: string,
  confirmation: string,
): Promise<void> {
  await page.getByLabel('Senha atual', { exact: true }).fill(current);
  await page.getByLabel('Nova senha', { exact: true }).fill(next);
  await page.getByLabel('Confirme a nova senha', { exact: true }).fill(confirmation);
  await page.getByRole('button', { name: 'Alterar senha' }).click();
}

async function expectInvalidLogin(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const ctx: BrowserContext = await browser.newContext({ baseURL: WEB_URL });
  try {
    const page = await ctx.newPage();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await fillLogin(page, email, password);
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos.');
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await ctx.close();
  }
}

async function expectValidLogin(browser: Browser, email: string, password: string): Promise<void> {
  const ctx: BrowserContext = await browser.newContext({ baseURL: WEB_URL });
  try {
    const page = await ctx.newPage();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    await fillLogin(page, email, password);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await ctx.close();
  }
}
