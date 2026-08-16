import { describe, expect, it } from '@jest/globals';

import { parseCookies } from './cookie';

describe('parseCookies', () => {
  it('parses a single cookie', () => {
    expect(parseCookies('a=1')).toEqual({ a: '1' });
  });

  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseCookies(' a = 1 ; b=2 ')).toEqual({ a: '1', b: '2' });
  });

  it('ignores empty segments', () => {
    expect(parseCookies(';a=1;;')).toEqual({ a: '1' });
  });

  it('ignores segments without an equals sign', () => {
    expect(parseCookies('a=1; broken')).toEqual({ a: '1' });
  });

  it('handles an empty header', () => {
    expect(parseCookies('')).toEqual({});
  });
});
