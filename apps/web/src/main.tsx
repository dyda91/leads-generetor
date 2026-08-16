import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';

import { createApiClient } from './api';
import { App } from './App';
import './styles/globals.css';

function renderRoot(element: ReactNode): void {
  const rootElement = document.getElementById('root');
  if (rootElement === null) {
    throw new Error('Root element not found.');
  }
  createRoot(rootElement).render(<StrictMode>{element}</StrictMode>);
}

function ConfigError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <p role="alert">Configuração inválida do cliente de API.</p>
    </main>
  );
}

try {
  createApiClient();
  renderRoot(<App />);
} catch {
  renderRoot(<ConfigError />);
}
