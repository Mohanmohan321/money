import { describe, expect, it } from 'vitest';

import { getClientBuildDirectory, shouldStartHttpServer } from './deployment';

describe('deployment runtime selection', () => {
  it('emits the Vercel frontend to the configured static output directory', () => {
    const vercelEnvironment = { VERCEL: '1' };

    expect(getClientBuildDirectory(vercelEnvironment)).toBe('dist/client');
  });

  it('does not open a persistent listener in the legacy Vercel function runtime', () => {
    const vercelEnvironment = { VERCEL: '1' };

    expect(shouldStartHttpServer(vercelEnvironment)).toBe(false);
  });

  it('opens the Node listener when Render supplies its runtime environment', () => {
    const renderEnvironment = { RENDER: 'true' };

    expect(shouldStartHttpServer(renderEnvironment)).toBe(true);
  });

  it('preserves the existing combined Node production server outside Vercel', () => {
    const localEnvironment = {};

    expect(getClientBuildDirectory(localEnvironment)).toBe('dist/client');
    expect(shouldStartHttpServer(localEnvironment)).toBe(true);
  });
});
