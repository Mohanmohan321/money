import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  BudgetCalendarCategory,
  BudgetCalendarDay,
  BudgetCalendarExpense,
  BudgetCalendarMonthConfiguration,
  BudgetCalendarOverride,
  BudgetCalendarRule,
  BudgetCalendarSettings,
  CreateBudgetCalendarCategoryInput,
  CreateBudgetCalendarExpenseInput,
  CreateBudgetCalendarRuleInput,
  UpdateBudgetCalendarCategoryInput,
  UpdateBudgetCalendarExpenseInput,
  UpdateBudgetCalendarMonthInput,
  UpdateBudgetCalendarRuleInput,
  UpdateBudgetCalendarSettingsInput,
  UpsertBudgetCalendarOverrideInput,
} from '../../shared/budget-calendar';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createBudgetCalendarRouter } from './routes';
import type { BudgetCalendarStore } from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

const now = '2026-10-09T00:00:00.000Z';
const categoryId = '00000000-0000-4000-8000-000000000101';
const secondCategoryId = '00000000-0000-4000-8000-000000000102';

function category(
  id: string,
  input: Partial<BudgetCalendarCategory> = {},
): BudgetCalendarCategory {
  return {
    id, name: 'Lunch', group: 'meal', monthlyAmount: '2400.00',
    includedInOverallBudget: true, active: true, sortOrder: 10,
    createdAt: now, updatedAt: now, ...input,
  };
}

class MemoryBudgetCalendarStore implements BudgetCalendarStore {
  settings: BudgetCalendarSettings = {
    weekStart: 1, weeklyFoodTarget: '1900.00', createdAt: now, updatedAt: now,
  };
  categories = [category(categoryId), category(secondCategoryId, {
    name: 'Snacks', group: 'snacks', monthlyAmount: '1200.00', sortOrder: 20,
  })];
  months = new Map<string, BudgetCalendarMonthConfiguration>();
  rules: BudgetCalendarRule[] = [];
  overrides = new Map<string, BudgetCalendarOverride>();
  expenses: BudgetCalendarExpense[] = [];
  recordedZeroDates = new Set<string>();

  async getSettings() { return this.settings; }
  async updateSettings(input: UpdateBudgetCalendarSettingsInput) {
    this.settings = { ...this.settings, ...input, updatedAt: now };
    return this.settings;
  }
  async listCategories(options?: { includeArchived?: boolean }) {
    return options?.includeArchived ? this.categories : this.categories.filter(({ active }) => active);
  }
  async createCategory(input: CreateBudgetCalendarCategoryInput) {
    const created = category('00000000-0000-4000-8000-000000000103', {
      ...input, sortOrder: input.sortOrder ?? 30,
    });
    this.categories.push(created);
    return created;
  }
  async updateCategory(id: string, input: UpdateBudgetCalendarCategoryInput) {
    const index = this.categories.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    this.categories[index] = { ...this.categories[index], ...input, updatedAt: now };
    return this.categories[index];
  }
  async archiveCategory(id: string) {
    const item = this.categories.find((candidate) => candidate.id === id);
    if (!item) return 'missing' as const;
    item.active = false;
    return 'archived' as const;
  }
  async getMonth(month: string) {
    const saved = this.months.get(month);
    if (saved) return saved;
    const created: BudgetCalendarMonthConfiguration = {
      month, overallLimit: '10000.00',
      categories: this.categories.map((item) => ({
        categoryId: item.id, name: item.name, group: item.group,
        monthlyAmount: item.monthlyAmount,
        includedInOverallBudget: item.includedInOverallBudget,
        sortOrder: item.sortOrder,
      })),
      createdAt: now, updatedAt: now,
    };
    this.months.set(month, created);
    return created;
  }
  async updateMonth(month: string, input: UpdateBudgetCalendarMonthInput) {
    const saved = { month, ...input, createdAt: now, updatedAt: now };
    this.months.set(month, saved);
    return saved;
  }
  async listRules() { return this.rules; }
  async createRule(input: CreateBudgetCalendarRuleInput) {
    const created: BudgetCalendarRule = {
      id: '00000000-0000-4000-8000-000000000201', ...input,
      createdAt: now, updatedAt: now,
    };
    this.rules.push(created);
    return created;
  }
  async updateRule(id: string, input: UpdateBudgetCalendarRuleInput) {
    const index = this.rules.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    this.rules[index] = { ...this.rules[index], ...input, updatedAt: now };
    return this.rules[index];
  }
  async deleteRule(id: string) {
    const before = this.rules.length;
    this.rules = this.rules.filter((item) => item.id !== id);
    return this.rules.length < before;
  }
  async upsertOverride(date: string, input: UpsertBudgetCalendarOverrideInput) {
    const saved = { date, ...input, createdAt: now, updatedAt: now };
    this.overrides.set(date, saved);
    return saved;
  }
  async deleteOverride(date: string) { return this.overrides.delete(date); }
  async getDay(date: string): Promise<BudgetCalendarDay> {
    const expenses = this.expenses.filter((item) => item.expenseDate === date);
    const actual = expenses.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2);
    const recordState = expenses.length > 0
      ? 'recorded_with_expenses' as const
      : this.recordedZeroDates.has(date) ? 'recorded_zero' as const : 'missing' as const;
    return {
      date, plannedAmount: '200.00', planSource: 'calculated', actualAmount: actual,
      remaining: (200 - Number(actual)).toFixed(2),
      variance: (Number(actual) - 200).toFixed(2),
      utilization: (Number(actual) / 2).toFixed(2),
      status: recordState === 'missing' ? 'missing' : Number(actual) > 200 ? 'over' : Number(actual) === 200 ? 'on' : 'under',
      recordState, expenses,
    };
  }
  async createExpense(input: CreateBudgetCalendarExpenseInput) {
    if (!this.categories.some(({ id, active }) => id === input.categoryId && active)) {
      return { outcome: 'invalid_category' as const };
    }
    const existing = this.expenses.find(({ idempotencyKey }) => idempotencyKey === input.idempotencyKey);
    if (existing) return { outcome: 'replayed' as const, expense: existing };
    const selectedCategory = this.categories.find(({ id }) => id === input.categoryId)!;
    const expense: BudgetCalendarExpense = {
      id: `00000000-0000-4000-8000-${String(300 + this.expenses.length).padStart(12, '0')}`,
      ...input, categoryName: selectedCategory.name, createdAt: now, updatedAt: now,
    };
    this.expenses.push(expense);
    this.recordedZeroDates.delete(input.expenseDate);
    return { outcome: 'created' as const, expense };
  }
  async updateExpense(id: string, input: UpdateBudgetCalendarExpenseInput) {
    if (!this.categories.some(({ id: candidate, active }) => candidate === input.categoryId && active)) {
      return 'invalid_category' as const;
    }
    const index = this.expenses.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    const selectedCategory = this.categories.find(({ id: candidate }) => candidate === input.categoryId)!;
    this.expenses[index] = {
      ...this.expenses[index], ...input, categoryName: selectedCategory.name, updatedAt: now,
    };
    return this.expenses[index];
  }
  async deleteExpense(id: string) {
    const before = this.expenses.length;
    this.expenses = this.expenses.filter((item) => item.id !== id);
    return this.expenses.length < before;
  }
  async setDayRecordState(date: string, recordedZero: boolean) {
    if (recordedZero && this.expenses.some((item) => item.expenseDate === date)) {
      return 'expenses_exist' as const;
    }
    if (recordedZero) this.recordedZeroDates.add(date);
    else this.recordedZeroDates.delete(date);
    return 'updated' as const;
  }
}

const config: AppConfig = {
  nodeEnv: 'test', databaseUrl: 'postgresql://unused', appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters', timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173', port: 3001,
};

describe('budget calendar configuration API', () => {
  let store: MemoryBudgetCalendarStore;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryBudgetCalendarStore();
    const protectedRouter = Router();
    protectedRouter.use('/budget-calendar', createBudgetCalendarRouter(store, config.timezone));
    app = createApp({ config, sessionStore: new MemorySessionStore(), protectedRouter });
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('protects every configuration endpoint with existing authentication', async () => {
    await request(app).get('/api/budget-calendar/categories').expect(401);
    const response = await agent.get('/api/budget-calendar/categories').expect(200);
    expect(response.body.data.items).toHaveLength(2);
  });

  it('reads and updates settings without using existing budget routes', async () => {
    await agent.get('/api/budget-calendar/settings').expect(200).expect(({ body }) => {
      expect(body.data.weeklyFoodTarget).toBe('1900.00');
    });
    await agent.put('/api/budget-calendar/settings')
      .send({ weekStart: 7, weeklyFoodTarget: '2000' }).expect(200).expect(({ body }) => {
        expect(body.data).toEqual(expect.objectContaining({ weekStart: 7, weeklyFoodTarget: '2000.00' }));
      });
  });

  it('creates, updates, and archives isolated categories', async () => {
    const created = await agent.post('/api/budget-calendar/categories').send({
      name: 'Tea', group: 'other', monthlyAmount: '300', includedInOverallBudget: true,
    }).expect(201);
    expect(created.body.data).toEqual(expect.objectContaining({ name: 'Tea', monthlyAmount: '300.00' }));
    await agent.put(`/api/budget-calendar/categories/${created.body.data.id}`).send({
      name: 'Tea and coffee', group: 'other', monthlyAmount: '350',
      includedInOverallBudget: false, active: true,
    }).expect(200);
    await agent.delete(`/api/budget-calendar/categories/${created.body.data.id}`).expect(200);
    expect(store.categories.find(({ id }) => id === created.body.data.id)?.active).toBe(false);
  });

  it('creates a stable month snapshot and allows an explicit selected-month update', async () => {
    const initial = await agent.get('/api/budget-calendar/months/2026-10').expect(200);
    expect(initial.body.data).toEqual(expect.objectContaining({
      month: '2026-10', overallLimit: '10000.00',
    }));

    await agent.put('/api/budget-calendar/months/2026-10').send({
      overallLimit: '9500',
      categories: [{
        categoryId, name: 'Lunch', group: 'meal', monthlyAmount: '2300',
        includedInOverallBudget: true, sortOrder: 10,
      }],
    }).expect(200).expect(({ body }) => {
      expect(body.data.overallLimit).toBe('9500.00');
      expect(body.data.categories[0].monthlyAmount).toBe('2300.00');
    });
  });

  it('creates, updates, and deletes rules and local-date overrides', async () => {
    const rule = await agent.post('/api/budget-calendar/rules').send({
      categoryId, frequency: 'weekly', amount: '600', weekdays: [1, 3, 5],
    }).expect(201);
    await agent.put(`/api/budget-calendar/rules/${rule.body.data.id}`).send({
      categoryId, frequency: 'daily', amount: '100', weekdays: [],
    }).expect(200);
    expect((await agent.get('/api/budget-calendar/rules').expect(200)).body.data.items[0].amount)
      .toBe('100.00');
    await agent.delete(`/api/budget-calendar/rules/${rule.body.data.id}`).expect(200);

    await agent.put('/api/budget-calendar/overrides/2026-10-09').send({
      plannedAmount: '200', note: 'Special plan',
    }).expect(200).expect(({ body }) => expect(body.data.plannedAmount).toBe('200.00'));
    await agent.delete('/api/budget-calendar/overrides/2026-10-09').expect(200);
  });

  it.each([
    ['/api/budget-calendar/months/2026-13', 'get'],
    ['/api/budget-calendar/overrides/2026-02-30', 'put'],
    ['/api/budget-calendar/categories/not-a-uuid', 'put'],
  ])('rejects invalid configuration request %s', async (path, method) => {
    const call = method === 'get' ? agent.get(path) : agent.put(path).send({});
    await call.expect(400).expect(({ body }) => {
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('creates multiple daily expenses and replays an idempotent retry without duplication', async () => {
    const input = {
      expenseDate: '2026-10-09', categoryId, amount: '150', description: 'Lunch',
      idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
    };
    const first = await agent.post('/api/budget-calendar/expenses').send(input).expect(201);
    const replay = await agent.post('/api/budget-calendar/expenses').send(input).expect(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
    await agent.post('/api/budget-calendar/expenses').send({
      ...input, amount: '100', categoryId: secondCategoryId,
      idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f51',
    }).expect(201);
    expect(store.expenses).toHaveLength(2);
    await agent.get('/api/budget-calendar/days/2026-10-09').expect(200).expect(({ body }) => {
      expect(body.data).toEqual(expect.objectContaining({
        actualAmount: '250.00', recordState: 'recorded_with_expenses', status: 'over',
      }));
    });
  });

  it('edits and deletes an expense without creating an existing transaction', async () => {
    const created = await agent.post('/api/budget-calendar/expenses').send({
      expenseDate: '2026-10-09', categoryId, amount: '150',
      idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f52',
    }).expect(201);
    await agent.put(`/api/budget-calendar/expenses/${created.body.data.id}`).send({
      expenseDate: '2026-10-10', categoryId: secondCategoryId, amount: '75', notes: 'Edited',
    }).expect(200).expect(({ body }) => {
      expect(body.data).toEqual(expect.objectContaining({
        expenseDate: '2026-10-10', categoryName: 'Snacks', amount: '75.00', notes: 'Edited',
      }));
    });
    await agent.delete(`/api/budget-calendar/expenses/${created.body.data.id}`).expect(200);
    await agent.delete(`/api/budget-calendar/expenses/${created.body.data.id}`).expect(404);
  });

  it('distinguishes missing and explicit zero and rejects zero while expenses exist', async () => {
    await agent.get('/api/budget-calendar/days/2026-10-08').expect(200).expect(({ body }) => {
      expect(body.data.recordState).toBe('missing');
    });
    await agent.put('/api/budget-calendar/days/2026-10-08/record-state')
      .send({ recordedZero: true }).expect(200);
    await agent.get('/api/budget-calendar/days/2026-10-08').expect(200).expect(({ body }) => {
      expect(body.data.recordState).toBe('recorded_zero');
    });

    await agent.post('/api/budget-calendar/expenses').send({
      expenseDate: '2026-10-09', categoryId, amount: '150',
      idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f53',
    }).expect(201);
    await agent.put('/api/budget-calendar/days/2026-10-09/record-state')
      .send({ recordedZero: true }).expect(409).expect(({ body }) => {
        expect(body.error.code).toBe('BUDGET_CALENDAR_DAY_HAS_EXPENSES');
      });
  });

  it('rejects inactive or missing expense categories', async () => {
    await agent.post('/api/budget-calendar/expenses').send({
      expenseDate: '2026-10-09', categoryId: '00000000-0000-4000-8000-000000009999',
      amount: '150', idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f54',
    }).expect(400).expect(({ body }) => {
      expect(body.error.code).toBe('BUDGET_CALENDAR_CATEGORY_INVALID');
    });
  });
});
