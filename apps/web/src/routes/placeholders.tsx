import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter } from '../components/ui/card';

/**
 * Minimal dashboard placeholder, rendered inside the AppShell's `<main>`.
 * Honest empty state: no invented numbers or data; the future search CTA is
 * explicitly disabled. A real dashboard belongs to a later group.
 */
export function DashboardPlaceholder() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visão geral da prospecção.</p>
      </div>
      <Card className="mt-6 w-full max-w-md">
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
  );
}

/**
 * Minimal protected placeholder for `/settings/security`, rendered inside the
 * AppShell's `<main>`. No functional form yet; the real password-change flow
 * belongs to a later group.
 */
export function SecurityPlaceholder() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <h1 className="text-xl font-semibold tracking-tight">Configurações de segurança</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A troca de senha estará disponível em uma próxima etapa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
