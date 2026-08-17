import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { API_URL } from '../setup/paths';

export type { AdminCredentials } from '../setup/seed';

/**
 * Known business endpoints. The current API exposes only auth + health; these
 * are the future search/leads paths the dashboard must never call. Requests are
 * matched by parsed pathname only, never by free regex on the full URL (which
 * can match the local repo path, e.g. `/leads-generetor`).
 */
export const KNOWN_BUSINESS_PATHS = ['/search', '/places', '/leads', '/lists', '/export'] as const;

/** True when a request targets exactly the E2E API origin and a business path. */
export function isBusinessRequest(requestUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== API_URL) {
    return false;
  }
  const pathname = parsed.pathname;
  return KNOWN_BUSINESS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Collects requests to exactly the E2E API origin (no bodies captured). */
export function collectApiRequests(page: Page): () => readonly string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    let parsed: URL;
    try {
      parsed = new URL(request.url());
    } catch {
      return;
    }
    if (parsed.origin === API_URL) {
      urls.push(request.url());
    }
  });
  return () => urls;
}

/** Fills the login form and submits it; resolves once the form is submitted. */
export async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Performs a login and waits for the authenticated dashboard to appear. */
export async function loginAsAdmin(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  await fillLogin(page, credentials.email, credentials.password);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
}

/** Opens the mobile drawer and returns the dialog locator. */
export async function openMobileDrawer(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
  const dialog = page.getByRole('dialog', { name: 'Menu de navegação' });
  await expect(dialog).toBeVisible();
  return dialog;
}
