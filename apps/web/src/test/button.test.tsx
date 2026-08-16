import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '../components/ui/button';

describe('Button', () => {
  it('renders a button with type="button" by default', () => {
    render(<Button>Entrar</Button>);
    const button = screen.getByRole('button', { name: 'Entrar' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders the variant classes', () => {
    const { rerender } = render(<Button variant="destructive">Excluir</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
    rerender(<Button variant="outline">Contorno</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-input');
    rerender(<Button variant="link">Link</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-primary');
  });

  it('respects disabled', () => {
    render(<Button disabled>Desabilitado</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('supports asChild to compose a child element', () => {
    render(
      <Button asChild>
        <a href="/alvo">Ir</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Ir' });
    expect(link).toHaveAttribute('href', '/alvo');
    expect(link).toHaveClass('bg-primary');
  });

  it('keeps a visible focus indicator class', () => {
    render(<Button>Foco</Button>);
    expect(screen.getByRole('button')).toHaveClass('focus-visible:ring-2');
  });
});
