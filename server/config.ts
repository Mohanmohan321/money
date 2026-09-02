export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  appPassword: string;
  sessionSecret: string;
  timezone: string;
  appOrigin: string;
  port: number;
}

const developmentSessionSecret = 'development-only-session-secret-change-me';

function requireProductionValue(
  env: NodeJS.ProcessEnv,
  key: 'APP_PASSWORD' | 'SESSION_SECRET' | 'APP_ORIGIN',
): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required in production`);
  }
  return value;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function parseOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
      throw new Error('invalid');
    }
    return url.origin;
  } catch {
    throw new Error('APP_ORIGIN must be an http(s) origin without a path');
  }
}

function parsePort(value: string | undefined): number {
  const port = value ? Number(value) : 3001;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required; configure a Neon PostgreSQL connection');
  }

  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const isProduction = nodeEnv === 'production';
  const appPassword = isProduction
    ? requireProductionValue(env, 'APP_PASSWORD')
    : env.APP_PASSWORD ?? '2003';
  const sessionSecret = isProduction
    ? requireProductionValue(env, 'SESSION_SECRET')
    : env.SESSION_SECRET ?? developmentSessionSecret;

  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  const timezone = env.APP_TIMEZONE?.trim() || 'Asia/Kolkata';
  if (!isValidTimezone(timezone)) {
    throw new Error('APP_TIMEZONE must be a valid IANA timezone');
  }

  const appOrigin = parseOrigin(
    isProduction
      ? requireProductionValue(env, 'APP_ORIGIN')
      : env.APP_ORIGIN ?? 'http://localhost:5173',
  );

  return {
    nodeEnv,
    databaseUrl,
    appPassword,
    sessionSecret,
    timezone,
    appOrigin,
    port: parsePort(env.PORT),
  };
}
