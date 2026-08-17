// @vitest-environment node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/globals.css'),
  'utf8',
);

function parseRootTokens(css: string): Record<string, string> {
  const match = /:root\s*{([^}]*)}/.exec(css);
  if (match === null || match[1] === undefined) {
    throw new Error('Missing :root token block in globals.css.');
  }
  const tokens: Record<string, string> = {};
  for (const declaration of match[1].split(';')) {
    const token = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/.exec(declaration);
    if (token !== null && token[1] !== undefined && token[2] !== undefined) {
      tokens[token[1]] = token[2];
    }
  }
  return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace(/^#/, '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  if (full.length !== 6) {
    throw new Error(`Unexpected hex value: ${hex}`);
  }
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = parseRootTokens(globalsCss);
const token = (name: string): string => {
  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`Missing token: ${name}`);
  }
  return value;
};

describe('design tokens (globals.css)', () => {
  it('integrates Tailwind CSS', () => {
    expect(globalsCss.trimStart().startsWith("@import 'tailwindcss'")).toBe(true);
  });

  it('defines the semantic tokens', () => {
    for (const name of [
      'background',
      'foreground',
      'surface',
      'surface-muted',
      'primary',
      'primary-hover',
      'primary-foreground',
      'secondary',
      'secondary-hover',
      'border',
      'input',
      'ring',
      'success',
      'warning',
      'destructive',
      'destructive-hover',
      'muted',
      'muted-foreground',
    ]) {
      expect(token(name)).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('has no dark mode active', () => {
    expect(globalsCss).not.toContain('prefers-color-scheme');
  });

  it('defines the widescreen layout tokens used by the shell', () => {
    expect(globalsCss).toMatch(/--container-content:\s*1200px/);
    expect(globalsCss).toMatch(/--sidebar-width:\s*240px/);
  });

  it('respects reduced motion for the used animations', () => {
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalsCss).toContain('.animate-pulse');
  });
});

describe('WCAG AA contrast (normal text ≥ 4.5:1, UI components ≥ 3:1)', () => {
  it('foreground text on background', () => {
    expect(contrast(token('foreground'), token('background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('muted foreground on background and on surface (placeholder)', () => {
    expect(contrast(token('muted-foreground'), token('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('muted-foreground'), token('surface'))).toBeGreaterThanOrEqual(4.5);
  });

  it('primary button (white on primary)', () => {
    expect(contrast(token('primary-foreground'), token('primary'))).toBeGreaterThanOrEqual(4.5);
  });

  it('primary as link on background', () => {
    expect(contrast(token('primary'), token('background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('destructive button (white on destructive)', () => {
    expect(contrast(token('destructive-foreground'), token('destructive'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('success and warning solid states (white text)', () => {
    expect(contrast(token('success-foreground'), token('success'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('warning-foreground'), token('warning'))).toBeGreaterThanOrEqual(4.5);
  });

  it('focus ring vs background (UI ≥ 3:1)', () => {
    expect(contrast(token('ring'), token('background'))).toBeGreaterThanOrEqual(3);
  });

  it('input border vs surface (UI ≥ 3:1)', () => {
    expect(contrast(token('input'), token('surface'))).toBeGreaterThanOrEqual(3);
  });

  it('feedback icons on their tinted surfaces', () => {
    expect(contrast(token('primary'), token('surface-info'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('success'), token('surface-success'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('warning'), token('surface-warning'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('destructive'), token('surface-error'))).toBeGreaterThanOrEqual(4.5);
  });

  it('destructive as error text on background', () => {
    expect(contrast(token('destructive'), token('background'))).toBeGreaterThanOrEqual(4.5);
  });
});
