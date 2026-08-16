import { describe, expect, it } from 'vitest';

import { cn } from '../lib/cn';

describe('cn utility', () => {
  it('joins conditional class names', () => {
    const includeB = false;
    const includeC = true;
    expect(cn('a', includeB && 'b', includeC && 'c', 'd')).toBe('a c d');
  });

  it('ignores undefined, null and falsy values', () => {
    expect(cn('a', undefined, null, '', 'b')).toBe('a b');
  });

  it('resolves Tailwind conflicts with the last class winning', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('bg-primary', 'bg-secondary')).toBe('bg-secondary');
  });

  it('returns a plain string without dynamic execution', () => {
    const result = cn('a', { b: true }, ['c']);
    expect(typeof result).toBe('string');
    expect(result).toBe('a b c');
  });
});
