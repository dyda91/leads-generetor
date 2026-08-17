import { LoaderCircle, LogOut } from 'lucide-react';
import { useRef, useState } from 'react';

import { ApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../ui/button';

function mapLogoutError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'http':
        switch (error.status) {
          case 403:
            return 'A solicitação não pôde ser validada. Tente novamente.';
          case 409:
            return 'Houve um conflito de sessão. Tente novamente.';
          case 429:
            return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
          default:
            return 'Não foi possível sair. Tente novamente.';
        }
      case 'network':
      case 'timeout':
        return 'Não foi possível conectar. Tente novamente.';
      default:
        return 'Ocorreu um erro inesperado. Tente novamente.';
    }
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

/**
 * Shared logout action for the authenticated shell (desktop sidebar and mobile
 * drawer). It calls `auth.logout()` exclusively — the CSRF stays inside the
 * AuthProvider and is never accessed here. Duplicate clicks while a logout is
 * in flight are ignored. On success (or a 401 that cleared the session) the
 * AuthProvider empties the user/CSRF and the router redirects to `/login` with
 * `replace`. On 403/409/429/500/network/timeout the session is preserved, a
 * controlled error is shown and a manual retry is allowed — never an automatic
 * retry. No user data, CSRF, cookie or token is ever rendered here.
 */
export function LogoutButton() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef(false);
  const alertRef = useRef<HTMLParagraphElement>(null);

  async function handleLogout(): Promise<void> {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (cause) {
      setError(mapLogoutError(cause));
      alertRef.current?.focus();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        onClick={() => void handleLogout()}
        disabled={pending}
        aria-busy={pending}
        className="w-full justify-start"
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        <span>Sair</span>
        {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
      </Button>
      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Saindo…
        </p>
      )}
      {error !== null && (
        <p
          role="alert"
          ref={alertRef}
          tabIndex={-1}
          className="rounded-md border border-destructive/30 bg-surface-error p-3 text-sm text-foreground focus:outline-none"
        >
          {error}
        </p>
      )}
    </div>
  );
}
