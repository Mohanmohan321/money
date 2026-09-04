import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { AppConfig } from './config';
import { createApp } from './app';
import type { SessionStore } from './auth/session-store';

class MemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, Date>();

  async create(tokenHash: string, expiresAt: Date) {
    this.sessions.set(tokenHash, expiresAt);
  }

  async isValid(tokenHash: string, now: Date) {
    const expiresAt = this.sessions.get(tokenHash);
    return Boolean(expiresAt && expiresAt > now);
  }

  async delete(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

const config: AppConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgresql://unused-in-unit-tests',
  appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters',
  timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173',
  port: 3001,
};

describe('authentication API', () => {
  it('keeps operational liveness outside the protected API namespace', async () => {
    const app = createApp({ config, sessionStore: new MemorySessionStore() });

    await request(app)
      .get('/healthz')
      .expect(200, { success: true, data: { status: 'ok' } });
    await request(app).get('/api/health').expect(401);
  });

  it('protects financial endpoints with the standard error contract', async () => {
    const app = createApp({ config, sessionStore: new MemorySessionStore() });

    const response = await request(app).get('/api/transactions').expect(401);

    expect(response.body).toEqual({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
  });

  it('keeps restrictive security headers while allowing only the receipt worker runtime', async () => {
    const response = await request(createApp({ config, sessionStore: new MemorySessionStore() }))
      .get('/healthz')
      .expect(200);
    const policy = response.headers['content-security-policy'];
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net");
    expect(policy).toContain("connect-src 'self' https://cdn.jsdelivr.net");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain('*');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');

    await request(createApp({ config, sessionStore: new MemorySessionStore() }))
      .get('/api/transactions')
      .expect(401);
  });

  it('logs in, reports authentication, logs out, and revokes the session', async () => {
    const store = new MemorySessionStore();
    const agent = request.agent(createApp({ config, sessionStore: store }));

    const login = await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
    expect(login.headers['set-cookie']?.[0]).toContain('money_session=');
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(login.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(login.body).toEqual({ success: true, data: { authenticated: true } });

    await agent
      .get('/api/auth/me')
      .expect(200, { success: true, data: { authenticated: true } });

    await agent
      .post('/api/auth/logout')
      .expect(200, { success: true, data: { authenticated: false } });

    expect(store.sessions.size).toBe(0);
    await agent
      .get('/api/auth/me')
      .expect(200, { success: true, data: { authenticated: false } });
  });

  it('rejects an incorrect password without creating or exposing a session', async () => {
    const store = new MemorySessionStore();
    const response = await request(createApp({ config, sessionStore: store }))
      .post('/api/auth/login')
      .send({ password: 'wrong' })
      .expect(401);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(store.sessions.size).toBe(0);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid password' },
    });
  });

  it('rejects malformed login requests and cross-origin state changes', async () => {
    const app = createApp({ config, sessionStore: new MemorySessionStore() });

    await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password":')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: false,
          error: { code: 'MALFORMED_JSON', message: 'Malformed JSON request body' },
        });
      });

    await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_ERROR'));

    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ password: '2003' })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('ORIGIN_FORBIDDEN'));
  });
});
