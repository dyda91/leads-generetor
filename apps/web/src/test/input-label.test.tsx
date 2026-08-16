import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

describe('Input and Label', () => {
  it('associates a label with the input via htmlFor/id', () => {
    render(
      <>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" />
      </>,
    );
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
  });

  it('reflects error state via aria-invalid and aria-describedby', () => {
    const { container } = render(
      <>
        <Input id="senha" type="password" aria-invalid="true" aria-describedby="senha-erro" />
        <p id="senha-erro">A senha é inválida.</p>
      </>,
    );
    const input = container.querySelector('#senha');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'senha-erro');
  });

  it('preserves autocomplete and type', () => {
    const { container } = render(<Input id="email" type="email" autoComplete="email" />);
    const input = container.querySelector('#email');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
  });

  it('does not alter the value (no trimming)', () => {
    render(<Input defaultValue="  valor com espaços  " />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('  valor com espaços  ');
  });

  it('Label marks a disabled state visually without breaking association', () => {
    const { container } = render(
      <Label htmlFor="x" disabled>
        Campo
      </Label>,
    );
    const label = container.querySelector('label');
    expect(label).toHaveAttribute('data-disabled');
    expect(label).toHaveClass('opacity-50');
  });
});
