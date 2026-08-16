import { Outlet } from 'react-router';

import { Brand } from './Brand';
import { MobileNav } from './mobile-nav';
import { NavList } from './navigation';

/**
 * Authenticated application shell. Only the protected routes render inside it
 * (public /login and the 404 stay outside). It owns the single `<main>`, a
 * centered widescreen container so the sidebar is never glued to the viewport
 * edge, a skip link, the desktop sidebar and the mobile header + drawer. It
 * never touches the API, cookie or CSRF, and renders no user-identifying data.
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface lg:hidden">
        <div className="mx-auto flex h-14 w-full max-w-[var(--container-content)] items-center justify-between gap-4 px-4">
          <Brand />
          <MobileNav />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[var(--container-content)] flex-1 items-start gap-6 px-4 py-6 lg:gap-8 lg:px-6">
        <aside
          aria-label="Menu lateral"
          className="hidden w-[var(--sidebar-width)] shrink-0 lg:block"
        >
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <Brand />
            </div>
            <nav aria-label="Navegação principal">
              <NavList />
            </nav>
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
