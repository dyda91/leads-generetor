import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from '../components/feedback/empty-state';
import { ErrorState } from '../components/feedback/error-state';
import { InlineAlert } from '../components/feedback/inline-alert';
import { LoadingState } from '../components/feedback/loading-state';

describe('InlineAlert', () => {
  it('uses role status by default and alert for errors', () => {
    const { rerender } = render(<InlineAlert variant="info">Info</InlineAlert>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(
      <InlineAlert variant="error" title="Erro">
        Problema
      </InlineAlert>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders children as text, never as interpreted HTML', () => {
    render(<InlineAlert variant="info">{'<b>não é HTML</b>'}</InlineAlert>);
    expect(screen.getByText('<b>não é HTML</b>')).toBeInTheDocument();
    expect(screen.queryByText('não é HTML')).toBeNull();
  });
});

describe('LoadingState', () => {
  it('announces via role status and hides skeletons from assistive tech', () => {
    const { container } = render(<LoadingState label="Carregando dados" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Carregando dados')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('ErrorState', () => {
  it('alerts and provides a typed retry', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Falhou" description="Tente novamente" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Tentar novamente' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never renders a stack trace', () => {
    render(<ErrorState title="Falhou" description="Erro controlado" />);
    expect(screen.queryByText(/Error:/)).toBeNull();
    expect(screen.queryByText(/ at /)).toBeNull();
  });

  it('renders a title string as text, not as HTML', () => {
    render(<ErrorState title={'<b>Falha</b>'} />);
    expect(screen.getByText('<b>Falha</b>')).toBeInTheDocument();
    expect(screen.queryByText('Falha')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('renders title and description without fake data', () => {
    render(<EmptyState title="Nenhuma pesquisa" description="Nenhuma pesquisa realizada ainda." />);
    expect(screen.getByText('Nenhuma pesquisa')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma pesquisa realizada ainda.')).toBeInTheDocument();
  });
});
