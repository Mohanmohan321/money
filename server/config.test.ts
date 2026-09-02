import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

const databaseUrl = 'postgresql://user:password@example.neon.tech/app?sslmode=require';

describe('loadConfig', () => {
  it('fails clearly when Neon is not configured without echoing secrets', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('uses safe local defaults for the initial password and timezone', () => {
    const config = loadConfig({ NODE_ENV: 'development', DATABASE_URL: databaseUrl });

    expect(config.appPassword).toBe('2003');
    expect(config.timezone).toBe('Asia/Kolkata');
    expect(config.appOrigin).toBe('http://localhost:5173');
    expect(config.port).toBe(3001);
  });

  it.each(['APP_PASSWORD', 'SESSION_SECRET', 'APP_ORIGIN']) (
    'requires %s in production',
    (missingKey) => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        APP_PASSWORD: 'not-the-default',
        SESSION_SECRET: 'x'.repeat(32),
        APP_ORIGIN: 'https://money.example.com',
      };
      delete env[missingKey];

      expect(() => loadConfig(env)).toThrow(`${missingKey} is required in production`);
    },
  );

  it('rejects invalid timezones and short production session secrets', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'development',
        DATABASE_URL: databaseUrl,
        APP_TIMEZONE: 'Nowhere/Imaginary',
      }),
    ).toThrow('APP_TIMEZONE must be a valid IANA timezone');

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        APP_PASSWORD: 'private',
        SESSION_SECRET: 'short',
        APP_ORIGIN: 'https://money.example.com',
      }),
    ).toThrow('SESSION_SECRET must contain at least 32 characters');
  });
});
