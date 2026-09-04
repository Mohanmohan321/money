import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SubscriptionCandidate, SubscriptionCandidateList } from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createSubscriptionRouter } from './routes';
import type { SubscriptionStore } from './store';

class MemorySessions implements SessionStore {
  private sessions = new Map<string, Date>();
  async create(hash: string, expiry: Date) { this.sessions.set(hash, expiry); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

const candidate: SubscriptionCandidate = {
  merchantKey: 'netflix', merchant: 'Netflix', category: 'entertainment', typicalAmount: '674.00',
  cadence: 'monthly', nextExpectedAt: '2026-09-01T10:00:00.000Z', monthlyEquivalent: '674.00',
  annualCost: '8088.00', confidence: 'medium', supportingTransactionIds: ['one', 'two'], reviewStatus: 'pending',
};

class MemorySubscriptions implements SubscriptionStore {
  status: SubscriptionCandidate['reviewStatus'] = 'pending';
  async listCandidates(): Promise<SubscriptionCandidateList> {
    const item = { ...candidate, reviewStatus: this.status };
    return {
      items: this.status === 'dismissed' ? [] : [item],
      confirmedMonthlyForecast: this.status === 'confirmed' ? item.monthlyEquivalent : '0.00',
    };
  }
  async reviewCandidate(key: string, status: 'confirmed' | 'dismissed') {
    if (key !== candidate.merchantKey) return undefined;
    this.status = status;
    return { ...candidate, reviewStatus: status };
  }
}

const config: AppConfig = {
  nodeEnv: 'test', databaseUrl: 'postgresql://unused', appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters', timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173', port: 3001,
};

describe('subscription review API', () => {
  let store: MemorySubscriptions;
  let agent: ReturnType<typeof request.agent>;
  beforeEach(async () => {
    store = new MemorySubscriptions();
    const router = Router();
    router.use(createSubscriptionRouter(store, config.timezone));
    agent = request.agent(createApp({ config, sessionStore: new MemorySessions(), protectedRouter: router }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('returns candidates and persists confirmation in the separate forecast', async () => {
    const before = await agent.get('/api/subscriptions/candidates').expect(200);
    expect(before.body.data.items[0]).toEqual(expect.objectContaining({
      reviewStatus: 'pending', supportingTransactionIds: ['one', 'two'],
    }));
    await agent.put('/api/subscriptions/netflix/review').send({ status: 'confirmed' }).expect(200);
    const after = await agent.get('/api/subscriptions/candidates').expect(200);
    expect(after.body.data.items[0].reviewStatus).toBe('confirmed');
    expect(after.body.data.confirmedMonthlyForecast).toBe('674.00');
  });

  it('persists dismissal while hiding it from the visible list', async () => {
    const reviewed = await agent.put('/api/subscriptions/netflix/review').send({ status: 'dismissed' }).expect(200);
    expect(reviewed.body.data.reviewStatus).toBe('dismissed');
    expect((await agent.get('/api/subscriptions/candidates').expect(200)).body.data.items).toEqual([]);
  });

  it.each([
    ['/api/subscriptions/netflix/review', { status: 'pending' }],
    ['/api/subscriptions/%20/review', { status: 'confirmed' }],
    [`/api/subscriptions/${'x'.repeat(201)}/review`, { status: 'confirmed' }],
  ])('rejects invalid review request %s', async (path, body) => {
    await agent.put(path).send(body).expect(400).expect(({ body: payload }) => {
      expect(payload.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('returns a stable error for unknown or stale candidates', async () => {
    await agent.put('/api/subscriptions/unknown/review').send({ status: 'confirmed' }).expect(404).expect(({ body }) => {
      expect(body.error.code).toBe('SUBSCRIPTION_CANDIDATE_NOT_FOUND');
    });
  });

  it('keeps both subscription routes authenticated', async () => {
    const router = Router();
    router.use(createSubscriptionRouter(store, config.timezone));
    const app = createApp({ config, sessionStore: new MemorySessions(), protectedRouter: router });
    await request(app).get('/api/subscriptions/candidates').expect(401);
    await request(app).put('/api/subscriptions/netflix/review').send({ status: 'confirmed' }).expect(401);
  });
});
