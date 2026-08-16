// @vitest-environment node

import { describe, expect, it } from 'vitest';

import viteConfig from '../../vite.config.ts';

describe('vite configuration', () => {
  it('binds the dev server to loopback on the approved port', () => {
    expect(viteConfig.server?.host).toBe('127.0.0.1');
    expect(viteConfig.server?.port).toBe(5173);
    expect(viteConfig.server?.strictPort).toBe(true);
    expect(viteConfig.server?.open).toBe(false);
  });

  it('keeps the preview server on loopback too', () => {
    expect(viteConfig.preview?.host).toBe('127.0.0.1');
    expect(viteConfig.preview?.strictPort).toBe(true);
  });

  it('disables public source maps in the build', () => {
    expect(viteConfig.build?.sourcemap).toBe(false);
  });
});
