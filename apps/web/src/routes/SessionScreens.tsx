import { ErrorState } from '../components/feedback/error-state';
import { LoadingState } from '../components/feedback/loading-state';

/**
 * Stable session-restoration loading screen. Shown while the session is being
 * resolved on any route: never redirects and never reveals protected content.
 */
export function SessionRestoringScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <LoadingState label="Restaurando sessão…" />
    </main>
  );
}

export interface SessionRecoverableErrorScreenProps {
  onRetry: () => void;
}

/**
 * Shown when session restoration fails (e.g. 500/network/timeout). This is NOT
 * a logout: the user stays on the current route with a controlled retry, and
 * no session state is cleared without explicit confirmation.
 */
export function SessionRecoverableErrorScreen({ onRetry }: SessionRecoverableErrorScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <ErrorState
        title="Não foi possível conectar"
        description="Tente novamente em instantes."
        onRetry={onRetry}
      />
    </main>
  );
}
