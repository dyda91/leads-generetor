import { Link } from 'react-router';

import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

/**
 * Minimal accessible 404. It is intentionally rendered BEFORE authentication
 * protection (public route), so an unknown path never leaks protected content,
 * the requested pathname, query, stack or internal routes. The only navigation
 * is a safe internal link to `/`, which itself routes unauthenticated users to
 * the login screen.
 */
export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <h1 className="text-xl font-semibold tracking-tight">Página não encontrada</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O endereço que você acessou não existe no sistema.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Ir para o início</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
