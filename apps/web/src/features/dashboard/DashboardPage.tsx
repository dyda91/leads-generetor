import { Search } from 'lucide-react';

import { EmptyState } from '../../components/feedback/empty-state';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '../../components/ui/card';

/**
 * Future steps described as plain, honest text. No dates, numbers or invented
 * data — just the direction of the product roadmap.
 */
const NEXT_STEPS = [
  'A pesquisa empresarial será liberada em uma próxima mudança do produto.',
  'Você poderá então revisar os resultados e organizar leads em listas.',
] as const;

/**
 * Authenticated dashboard. Rendered inside the AppShell's `<main>` (the shell
 * owns the single `<main>`; this page adds none). It is a truthful empty state:
 * there are no searches or leads yet, the future search CTA is disabled with an
 * accessible explanation, and no API, storage, cookie or user data is touched.
 */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Prospecção de empresas para novos negócios: encontre, organize e avance nas suas
          oportunidades.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold leading-tight">Pesquisas</h2>
          <CardDescription>Resultados da prospecção empresarial.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Search}
            title="Nenhuma pesquisa realizada"
            description="Ainda não existem pesquisas ou leads. A pesquisa empresarial será disponibilizada em uma próxima mudança do produto."
            titleLevel={3}
          >
            <div className="flex flex-col items-center gap-1.5">
              <Button type="button" disabled aria-describedby="search-unavailable-note">
                Pesquisar empresas
              </Button>
              <p id="search-unavailable-note" className="text-xs text-muted-foreground">
                A pesquisa de empresas ainda não está disponível.
              </p>
            </div>
          </EmptyState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold leading-tight">Próximos passos</h2>
          <CardDescription>O que vem pela frente na plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
            {NEXT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
