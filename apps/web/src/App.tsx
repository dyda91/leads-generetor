import { LayoutGrid } from 'lucide-react';

import { useAuth } from './auth/AuthProvider';
import { ErrorState } from './components/feedback/error-state';
import { Button } from './components/ui/button';
import { Card, CardContent, CardFooter } from './components/ui/card';
import { LoginScreen } from './features/login/LoginScreen';

export function App() {
  const { state, retrySessionRestore } = useAuth();

  if (state.status === 'restoring') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <p role="status">Restaurando sessão…</p>
      </main>
    );
  }

  if (state.status === 'recoverable-error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <ErrorState
          title="Não foi possível conectar"
          description="Tente novamente em instantes."
          onRetry={retrySessionRestore}
        />
      </main>
    );
  }

  if (state.status === 'unauthenticated') {
    return <LoginScreen />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md">
        <header className="mb-8 flex flex-col items-center gap-2 text-center">
          <LayoutGrid aria-hidden="true" className="size-7 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Leads — Prospecção Empresarial</h1>
          <p className="text-sm text-muted-foreground">Aplicação em configuração</p>
        </header>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-foreground">
              O sistema está sendo preparado. Pesquisa e gestão de leads estarão disponíveis em
              próximas etapas.
            </p>
          </CardContent>
          <CardFooter>
            <Button type="button" disabled>
              Em breve
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
