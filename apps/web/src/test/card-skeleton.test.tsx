import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';

describe('Card', () => {
  it('composes all card parts', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Título</CardTitle>
          <CardDescription>Descrição</CardDescription>
        </CardHeader>
        <CardContent>Conteúdo</CardContent>
        <CardFooter>Rodapé</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Título')).toBeInTheDocument();
    expect(screen.getByText('Descrição')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByText('Rodapé')).toBeInTheDocument();
  });

  it('CardTitle is not a fixed heading element', () => {
    const { container } = render(<CardTitle>Título</CardTitle>);
    expect(container.querySelector('h1,h2,h3,h4,h5,h6')).toBeNull();
  });
});

describe('Skeleton', () => {
  it('is decorative and hidden from assistive tech', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const skeleton = container.querySelector('[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveClass('animate-pulse');
  });
});
