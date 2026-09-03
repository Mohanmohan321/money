import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AnalyticsData,
  DashboardData,
  HistoryItem,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createAggregateRouter } from './routes';
import type {
  AggregateStore,
  AnalyticsStoreQuery,
  DashboardStoreQuery,
  HistoryStoreQuery,
} from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

const historyItem: HistoryItem = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'lent',
  personName: 'Maya',
  amount: '50.00',
  createdAt: '2026-09-02T11:00:00.000Z',
};

const allHistoryItems: HistoryItem[] = [
  {
    id: '00000000-0000-4000-8000-000000000004',
    type: 'transaction',
    description: 'Swiggy dinner',
    category: 'food',
    amount: '23.40',
    createdAt: '2026-09-02T13:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    type: 'income',
    source: 'Freelance site',
    category: 'freelance',
    amount: '5000.00',
    createdAt: '2026-09-02T12:00:00.000Z',
  },
  historyItem,
  {
    id: '00000000-0000-4000-8000-000000000002',
    type: 'borrowed',
    personName: 'Arun',
    amount: '75.25',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
];

const dashboard: DashboardData = {
  timezone: 'Asia/Kolkata',
  today: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25',
    transactionCount: 1, lendingCount: 1, borrowingCount: 1,
  },
  week: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25', recordCount: 3,
    daily: [{ date: '2026-09-02', transactionAmount: '23.40', lentAmount: '50.00', borrowedAmount: '75.25' }],
  },
  month: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25', recordCount: 3,
    daily: [{ date: '2026-09-02', transactionAmount: '23.40', lentAmount: '50.00', borrowedAmount: '75.25' }],
  },
};

const analytics: AnalyticsData = {
  period: 'day', timezone: 'Asia/Kolkata', from: '2026-08-04', to: '2026-09-02',
  movement: [{ date: '2026-09-02', transactionAmount: '23.40', lentAmount: '50.00', borrowedAmount: '75.25' }],
  transactions: { totalAmount: '23.40', count: 1, averageAmount: '23.40', largestAmount: '23.40', smallestAmount: '23.40' },
  lending: { totalAmount: '50.00', count: 1, averageAmount: '50.00', largestAmount: '50.00' },
  borrowing: { totalAmount: '75.25', count: 1, averageAmount: '75.25', largestAmount: '75.25' },
  lendingByPerson: [{ personName: 'Maya', totalAmount: '50.00', numberOfLoans: 1 }],
  borrowingByPerson: [{ personName: 'Arun', totalAmount: '75.25', numberOfBorrowings: 1 }],
};

class MemoryAggregateStore implements AggregateStore {
  historyQuery?: HistoryStoreQuery;
  dashboardQuery?: DashboardStoreQuery;
  analyticsQuery?: AnalyticsStoreQuery;
  historyItems: HistoryItem[] = [historyItem];
  async getHistory(query: HistoryStoreQuery) {
    this.historyQuery = query;
    return { items: this.historyItems, total: this.historyItems.length };
  }
  async getDashboard(query: DashboardStoreQuery) { this.dashboardQuery = query; return dashboard; }
  async getAnalytics(query: AnalyticsStoreQuery) { this.analyticsQuery = query; return { ...analytics, period: query.period }; }
}

const config: AppConfig = {
  nodeEnv: 'test', databaseUrl: 'postgresql://unused', appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters', timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173', port: 3001,
};

describe('history, dashboard, and analytics APIs', () => {
  let store: MemoryAggregateStore;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryAggregateStore();
    const protectedRouter = Router();
    protectedRouter.use(createAggregateRouter(store, config.timezone, () => new Date('2026-09-02T12:00:00.000Z')));
    agent = request.agent(createApp({ config, sessionStore: new MemorySessionStore(), protectedRouter }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('returns normalized paginated history and converts local date filters', async () => {
    const response = await agent
      .get('/api/history?type=lent&from=2026-09-02&to=2026-09-02&limit=20&offset=5')
      .expect(200);

    expect(response.body).toEqual({ success: true, data: { items: [historyItem], total: 1, limit: 20, offset: 5 } });
    expect(store.historyQuery).toEqual(expect.objectContaining({ type: 'lent', limit: 20, offset: 5 }));
    expect(store.historyQuery?.from?.toISOString()).toBe('2026-09-01T18:30:00.000Z');
    expect(store.historyQuery?.toExclusive?.toISOString()).toBe('2026-09-02T18:30:00.000Z');
  });

  it.each(['transaction', 'lent', 'borrowed', 'income'] as const)(
    'accepts the %s History record type without changing the existing filters',
    async (type) => {
      await agent.get(`/api/history?type=${type}`).expect(200);
      expect(store.historyQuery?.type).toBe(type);
    },
  );

  it('returns income source and category without changing existing History item shapes or order', async () => {
    store.historyItems = allHistoryItems;

    const response = await agent.get('/api/history').expect(200);

    expect(response.body.data.items).toEqual(allHistoryItems);
    expect(response.body.data.items.map((item: HistoryItem) => item.type)).toEqual([
      'transaction',
      'income',
      'lent',
      'borrowed',
    ]);
  });

  it('returns server-computed daily, weekly, and monthly dashboard data without a balance', async () => {
    const response = await agent.get('/api/dashboard').expect(200);
    expect(response.body).toEqual({ success: true, data: dashboard });
    expect(response.body.data.balance).toBeUndefined();
    expect(store.dashboardQuery?.ranges.today.from.toISOString()).toBe('2026-09-01T18:30:00.000Z');
  });

  it.each(['day', 'week', 'month', 'year'] as const)('returns chart-ready %s analytics', async (period) => {
    const response = await agent.get(`/api/analytics?period=${period}`).expect(200);
    expect(response.body.data.period).toBe(period);
    expect(response.body.data.movement[0].transactionAmount).toBe('23.40');
    expect(response.body.data.lendingByPerson[0].numberOfLoans).toBe(1);
    expect(store.analyticsQuery?.from).toBeInstanceOf(Date);
    expect(store.analyticsQuery?.toExclusive).toBeInstanceOf(Date);
  });

  it.each([
    '/api/history?limit=101',
    '/api/history?type=expense',
    '/api/analytics?period=quarter',
    '/api/analytics?from=2026-02-30',
  ])('rejects invalid aggregate query %s', async (path) => {
    const response = await agent.get(path).expect(400);
    expect(response.body.success).toBe(false);
  });
});
