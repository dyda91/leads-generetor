import { LayoutGrid } from 'lucide-react';

import { InlineAlert } from './components/feedback/inline-alert';
import { Button } from './components/ui/button';
import { Card, CardContent, CardFooter } from './components/ui/card';

export function App() {
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
            <InlineAlert variant="info" title="Em preparação">
              O sistema está sendo preparado. Pesquisa e gestão de leads estarão disponíveis em
              próximas etapas.
            </InlineAlert>
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
