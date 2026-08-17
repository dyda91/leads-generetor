import { describe, expect, it } from 'vitest';

import { resolvePostLoginDestination } from '../routes/destinations';

describe('resolvePostLoginDestination — control characters', () => {
  it('rejects a destination containing a newline', () => {
    expect(resolvePostLoginDestination({ from: '/settings/security\n' })).toBe('/');
  });

  it('rejects a destination containing a NUL byte', () => {
    expect(resolvePostLoginDestination({ from: '/settings/security\u0000' })).toBe('/');
  });

  it('rejects a destination containing a tab', () => {
    expect(resolvePostLoginDestination({ from: '\t/' })).toBe('/');
  });

  it('rejects a destination containing a DEL character', () => {
    expect(resolvePostLoginDestination({ from: '/settings\u007f/security' })).toBe('/');
  });

  it('accepts a clean allowed destination', () => {
    expect(resolvePostLoginDestination({ from: '/settings/security' })).toBe('/settings/security');
  });
});
