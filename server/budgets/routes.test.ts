import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CreateIncomeInput,
  IncomeRecord,
  MonthlyBudget,
  UpsertBudgetInput,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createBudgetRouter } from './routes';
import type { BudgetStore, ListFilters } from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

class MemoryBudgetStore implements BudgetStore {
  readonly saved = new Map<string, MonthlyBudget>();
  readonly income = new Map<string, IncomeRecord>();
  lastFilters: ListFilters = {};
  private nextId = 1;

  async getBudget(month: string): Promise<MonthlyBudget> {
    const current = this.saved.get(month);
    if (current) return current;

    const prior = [...this.saved.values()]
      .filter((budget) => budget.month < month)
      .sort((left, right) => right.month.localeCompare(left.month))[0];

    return {
      month,
      salary: prior?.salary ?? '0.00',
      spendingLimit: prior?.spendingLimit ?? '0.00',
      savingsTarget: prior?.savingsTarget ?? '0.00',
      source: 'suggested',
    };
  }

  async upsertBudget(month: string, input: UpsertBudgetInput): Promise<MonthlyBudget> {
    const budget: MonthlyBudget = {
      month,
      ...input,
      source: 'saved',
      updatedAt: '2026-09-03T08:00:00.000Z',
    };
    this.saved.set(month, budget);
    return budget;
  }

  async createIncome(input: CreateIncomeInput): Promise<IncomeRecord> {
    const item: IncomeRecord = {
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
      ...input,
      createdAt: '2026-09-03T08:30:00.000Z',
    };
    this.income.set(item.id, item);
    return item;
  }

  async listIncome(filters: ListFilters): Promise<IncomeRecord[]> {
    this.lastFilters = filters;
    return [...this.income.values()];
  }

  async getIncome(id: string): Promise<IncomeRecord | undefined> {
    return this.income.get(id);
  }

  async deleteIncome(id: string): Promise<boolean> {
    return this.income.delete(id);
  }
}

const config: AppConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgresql://unused',
  appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters',
  timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173',
  port: 3001,
};

const savedAugust: MonthlyBudget = {
  month: '2026-08',
  salary: '50000.00',
  spendingLimit: '20000.00',
  savingsTarget: '10000.00',
  source: 'saved',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('monthly budget and income APIs', () => {
  let store: MemoryBudgetStore;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryBudgetStore();
    const protectedRouter = Router();
    protectedRouter.use(createBudgetRouter(store, config.timezone));
    agent = request.agent(createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter,
    }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('returns a saved budget for the requested month', async () => {
    store.saved.set(savedAugust.month, savedAugust);

    const response = await agent.get('/api/budgets/2026-08').expect(200);

    expect(response.body).toEqual({ success: true, data: savedAugust });
  });

  it('returns a carry-forward suggestion without saving it', async () => {
    store.saved.set('2026-08', savedAugust);

    const response = await agent.get('/api/budgets/2026-09').expect(200);

    expect(response.body.data).toEqual(expect.objectContaining({
      month: '2026-09',
      salary: '50000.00',
      spendingLimit: '20000.00',
      savingsTarget: '10000.00',
      source: 'suggested',
    }));
    expect(store.saved.has('2026-09')).toBe(false);
  });

  it('returns a zero-value suggestion when there is no earlier budget', async () => {
    const response = await agent.get('/api/budgets/2026-09').expect(200);

    expect(response.body.data).toEqual({
      month: '2026-09',
      salary: '0.00',
      spendingLimit: '0.00',
      savingsTarget: '0.00',
      source: 'suggested',
    });
  });

  it('upserts a normalized monthly plan', async () => {
    const response = await agent.put('/api/budgets/2026-09').send({
      salary: '50000',
      spendingLimit: '20000',
      savingsTarget: '10000',
      source: 'client-controlled',
      updatedAt: '2000-01-01T00:00:00.000Z',
    }).expect(200);

    expect(response.body.data).toEqual({
      month: '2026-09',
      salary: '50000.00',
      spendingLimit: '20000.00',
      savingsTarget: '10000.00',
      source: 'saved',
      updatedAt: '2026-09-03T08:00:00.000Z',
    });
  });

  it('creates additional income with a server-controlled ID and time', async () => {
    const response = await agent.post('/api/income').send({
      source: ' Freelance site ',
      category: 'freelance',
      amount: '5000',
      id: 'client-controlled',
      createdAt: '2000-01-01T00:00:00.000Z',
    }).expect(201);

    expect(response.body.data).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      source: 'Freelance site',
      amount: '5000.00',
      category: 'freelance',
      createdAt: expect.stringMatching(/Z$/),
    }));
  });

  it.each([
    ['GET', '/api/budgets/2026-13', undefined],
    ['PUT', '/api/budgets/2026-09', { salary: '-1', spendingLimit: '20000', savingsTarget: '10000' }],
    ['POST', '/api/income', { source: 'Gift', category: 'gift', amount: '10' }],
  ])('rejects invalid %s %s input using the validation envelope', async (method, path, body) => {
    const response = method === 'GET'
      ? await agent.get(path).expect(400)
      : method === 'PUT'
        ? await agent.put(path).send(body).expect(400)
        : await agent.post(path).send(body).expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('converts local income date filters to UTC storage boundaries', async () => {
    await agent.get('/api/income?from=2026-09-03&to=2026-09-03').expect(200);

    expect(store.lastFilters.from?.toISOString()).toBe('2026-09-02T18:30:00.000Z');
    expect(store.lastFilters.toExclusive?.toISOString()).toBe('2026-09-03T18:30:00.000Z');
  });

  it('looks up an income record by UUID', async () => {
    const created = await agent.post('/api/income').send({
      source: 'Refund',
      category: 'refund',
      amount: '125.50',
    }).expect(201);

    const response = await agent.get(`/api/income/${created.body.data.id}`).expect(200);

    expect(response.body).toEqual({ success: true, data: created.body.data });
  });

  it('returns INCOME_NOT_FOUND when deleting a missing income record', async () => {
    const response = await agent
      .delete('/api/income/00000000-0000-4000-8000-000000000099')
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: { code: 'INCOME_NOT_FOUND', message: 'Income record not found' },
    });
  });

  it('rejects malformed income UUIDs without querying a dynamic budget route', async () => {
    const response = await agent.get('/api/income/not-a-uuid').expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
