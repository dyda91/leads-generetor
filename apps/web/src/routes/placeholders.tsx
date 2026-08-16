import { LayoutGrid } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter } from '../components/ui/card';

/**
 * Minimal dashboard placeholder. Honest empty state: no invented numbers or
 * data; the future search CTA is explicitly disabled. The definitive layout,
 * sidebar/drawer and real dashboard belong to later groups.
 */
export function DashboardPlaceholder() {
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

/**
 * Minimal protected placeholder for `/settings/security`. No functional form
 * yet; the real password-change flow belongs to a later group.
 */
export function SecurityPlaceholder() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <h1 className="text-xl font-semibold tracking-tight">Configurações de segurança</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A troca de senha estará disponível em uma próxima etapa.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
