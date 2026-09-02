import { describe, expect, it } from 'vitest';

import { getClientBuildDirectory, shouldStartHttpServer } from './deployment';

describe('deployment runtime selection', () => {
  it('emits static assets to Vercel public output and never opens a persistent listener there', () => {
    const vercelEnvironment = { VERCEL: '1' };

    expect(getClientBuildDirectory(vercelEnvironment)).toBe('public');
    expect(shouldStartHttpServer(vercelEnvironment)).toBe(false);
  });

  it('preserves the existing combined Node production server outside Vercel', () => {
    const localEnvironment = {};

    expect(getClientBuildDirectory(localEnvironment)).toBe('dist/client');
    expect(shouldStartHttpServer(localEnvironment)).toBe(true);
  });
});
