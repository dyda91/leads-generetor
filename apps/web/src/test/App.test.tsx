import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the accessible product title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Leads');
  });

  it('renders the setup placeholder', () => {
    render(<App />);
    expect(screen.getByText('Aplicação em configuração')).toBeInTheDocument();
  });

  it('does not call fetch while rendering', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<App />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not touch localStorage or sessionStorage while rendering', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
