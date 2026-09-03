import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AnnualReportData,
  BudgetBreakdownData,
  MonthlyAnalysisData,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createPlanningRouter } from './routes';
import type {
  AnnualPlanningQuery,
  BreakdownPlanningQuery,
  MonthlyPlanningQuery,
  PlanningStore,
} from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

const monthlyView: MonthlyAnalysisData = {
  month: '2026-09',
  budget: {
    month: '2026-09', salary: '50000.00', spendingLimit: '20000.00',
    savingsTarget: '10000.00', source: 'saved', updatedAt: '2026-09-01T00:00:00.000Z',
  },
  summary: {
    income: '51000.00', spending: '200.00', savings: '500.00', amountLeft: '50300.00',
    budgetScore: '0.98', spendingRemaining: '19800.00',
  },
  categories: [],
  weekFrom: '2026-08-31',
  weekTo: '2026-09-06',
  week: [],
  recentActivity: [],
};

const breakdownView: BudgetBreakdownData = {
  year: '2026', selectedMonth: '2026-09', months: [], days: [],
};

const annualView: AnnualReportData = {
  year: '2026',
  summary: {
    income: '0.00', spending: '0.00', savings: '0.00', amountLeft: '0.00',
    budgetScore: '0.00', spendingRemaining: '0.00',
  },
  months: [], spendingByCategory: [], incomeBySource: [],
};

class MemoryPlanningStore implements PlanningStore {
  monthlyQuery?: MonthlyPlanningQuery;
  breakdownQuery?: BreakdownPlanningQuery;
  annualQuery?: AnnualPlanningQuery;
  monthlyError?: Error;

  async getMonthly(query: MonthlyPlanningQuery) {
    this.monthlyQuery = query;
    if (this.monthlyError) throw this.monthlyError;
    return monthlyView;
  }

  async getBreakdown(query: BreakdownPlanningQuery) {
    this.breakdownQuery = query;
    return breakdownView;
  }

  async getAnnual(query: AnnualPlanningQuery) {
    this.annualQuery = query;
    return annualView;
  }
}

const config: AppConfig = {
  nodeEnv: 'test', databaseUrl: 'postgresql://unused', appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters', timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173', port: 3001,
};

describe('planning analysis API', () => {
  let store: MemoryPlanningStore;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryPlanningStore();
    const protectedRouter = Router();
    protectedRouter.use(createPlanningRouter(store, config.timezone));
    agent = request.agent(createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter,
    }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('returns the selected month and Monday-Sunday view', async () => {
    const response = await agent
      .get('/api/analysis/monthly?month=2026-09&week=2026-09-03')
      .expect(200);

    expect(response.body).toEqual({ success: true, data: monthlyView });
    expect(store.monthlyQuery).toEqual(expect.objectContaining({
      month: '2026-09', timezone: 'Asia/Kolkata',
      weekFromLabel: '2026-08-31', weekToLabel: '2026-09-06',
    }));
    expect(store.monthlyQuery?.range.from.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(store.monthlyQuery?.range.toExclusive.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(store.monthlyQuery?.week.from.toISOString()).toBe('2026-08-30T18:30:00.000Z');
    expect(store.monthlyQuery?.week.toExclusive.toISOString()).toBe('2026-09-06T18:30:00.000Z');
  });

  it('defaults the monthly week to the first day of the selected month', async () => {
    await agent.get('/api/analysis/monthly?month=2026-09').expect(200);

    expect(store.monthlyQuery?.weekFromLabel).toBe('2026-08-31');
    expect(store.monthlyQuery?.weekToLabel).toBe('2026-09-06');
  });

  it('returns converted breakdown and annual ranges', async () => {
    await agent.get('/api/analysis/breakdown?year=2026&month=2026-09').expect(200);
    expect(store.breakdownQuery).toEqual(expect.objectContaining({
      year: '2026', selectedMonth: '2026-09', timezone: 'Asia/Kolkata',
    }));
    expect(store.breakdownQuery?.yearRange.from.toISOString()).toBe('2025-12-31T18:30:00.000Z');
    expect(store.breakdownQuery?.yearRange.toExclusive.toISOString()).toBe('2026-12-31T18:30:00.000Z');
    expect(store.breakdownQuery?.monthRange.from.toISOString()).toBe('2026-08-31T18:30:00.000Z');

    await agent.get('/api/analysis/annual?year=2026').expect(200);
    expect(store.annualQuery?.range.from.toISOString()).toBe('2025-12-31T18:30:00.000Z');
    expect(store.annualQuery?.range.toExclusive.toISOString()).toBe('2026-12-31T18:30:00.000Z');
  });

  it.each([
    '/api/analysis/monthly?month=2026-13',
    '/api/analysis/monthly?month=2026-09&week=2026-02-30',
    '/api/analysis/breakdown?year=2026&month=2025-09',
    '/api/analysis/annual?year=20x6',
  ])('rejects invalid planning query %s', async (path) => {
    await agent.get(path).expect(400).expect(({ body }) => {
      expect(body).toEqual(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }));
    });
  });

  it('converts range failures to the existing INVALID_DATE envelope', async () => {
    const invalidConfig = { ...config, timezone: 'Mars/Olympus' };
    const protectedRouter = Router();
    protectedRouter.use(createPlanningRouter(store, invalidConfig.timezone));
    const invalidAgent = request.agent(createApp({
      config: invalidConfig,
      sessionStore: new MemorySessionStore(),
      protectedRouter,
    }));
    await invalidAgent.post('/api/auth/login').send({ password: '2003' }).expect(200);

    await invalidAgent.get('/api/analysis/monthly?month=2026-09').expect(400).expect(({ body }) => {
      expect(body.error.code).toBe('INVALID_DATE');
    });
  });

  it('does not disguise store failures as invalid dates', async () => {
    store.monthlyError = new Error('database unavailable');

    await agent.get('/api/analysis/monthly?month=2026-09').expect(500).expect(({ body }) => {
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  it('keeps planning endpoints behind authentication', async () => {
    const protectedRouter = Router();
    protectedRouter.use(createPlanningRouter(store, config.timezone));
    const app = createApp({
      config, sessionStore: new MemorySessionStore(), protectedRouter,
    });

    await request(app).get('/api/analysis/monthly?month=2026-09').expect(401).expect(({ body }) => {
      expect(body.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
