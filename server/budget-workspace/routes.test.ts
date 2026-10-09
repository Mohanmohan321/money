import request from 'supertest';
import { Router } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_BUDGET_SETTINGS, buildBudgetMonth, type BudgetDateOverride, type BudgetExpense, type BudgetSettings } from '../../shared/budget-workspace';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createBudgetWorkspaceRouter } from './routes';
import type { BudgetWorkspaceStore, CreateBudgetExpenseInput } from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

class MemoryBudgetStore implements BudgetWorkspaceStore {
  settings: BudgetSettings = structuredClone(DEFAULT_BUDGET_SETTINGS);
  expenses: BudgetExpense[] = [];
  overrides: BudgetDateOverride[] = [];
  zeroDates = new Set<string>();
  async getWorkspace(month: string, today: string) { return buildBudgetMonth({ month, today, settings: this.settings, expenses: this.expenses.filter((item) => item.expenseDate.startsWith(month)), overrides: this.overrides, explicitZeroDates: [...this.zeroDates] }); }
  async saveSettings(settings: BudgetSettings) { this.settings = settings; return settings; }
  async saveOverride(value: BudgetDateOverride) { this.overrides = [...this.overrides.filter((item) => item.date !== value.date), value]; return value; }
  async deleteOverride(date: string) { this.overrides = this.overrides.filter((item) => item.date !== date); return true; }
  async setRecordedZero(date: string, recorded: boolean) { if (recorded) this.zeroDates.add(date); else this.zeroDates.delete(date); return recorded; }
  async createExpense(input: CreateBudgetExpenseInput) {
    const duplicate = this.expenses.find((item) => item.id === input.idempotencyKey);
    if (duplicate) return duplicate;
    const item: BudgetExpense = { id: input.idempotencyKey, ...input, notes: input.notes ?? null, createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' };
    this.expenses.push(item); this.zeroDates.delete(input.expenseDate); return item;
  }
  async updateExpense(id: string, input: Omit<CreateBudgetExpenseInput, 'idempotencyKey'>) { const item = this.expenses.find((value) => value.id === id); if (!item) return undefined; Object.assign(item, input, { updatedAt: '2026-10-09T11:00:00.000Z' }); return item; }
  async deleteExpense(id: string) { const count = this.expenses.length; this.expenses = this.expenses.filter((item) => item.id !== id); return this.expenses.length < count; }
}

const config: AppConfig = { nodeEnv: 'test', databaseUrl: 'postgresql://unused', appPassword: '2003', sessionSecret: 'test-session-secret-at-least-32-characters', timezone: 'Asia/Kolkata', appOrigin: 'http://localhost:5173', port: 3001 };

describe('budget workspace API', () => {
  let store: MemoryBudgetStore;
  let agent: ReturnType<typeof request.agent>;
  beforeEach(async () => {
    store = new MemoryBudgetStore();
    const router = Router(); router.use('/budget', createBudgetWorkspaceRouter(store));
    agent = request.agent(createApp({ config, sessionStore: new MemorySessionStore(), protectedRouter: router }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('rejects anonymous access and returns a local-date monthly workspace', async () => {
    const anonymous = request(createApp({ config, sessionStore: new MemorySessionStore(), protectedRouter: Router().use('/budget', createBudgetWorkspaceRouter(store)) }));
    await anonymous.get('/api/budget/2026-10?today=2026-10-09').expect(401);
    const response = await agent.get('/api/budget/2026-10?today=2026-10-09').expect(200);
    expect(response.body.data.days).toHaveLength(31);
    expect(response.body.data.summary.monthlyBudget).toBe('10000.00');
  });

  it('persists idempotent daily expenses, edits, deletes, overrides, zero records, and settings', async () => {
    const key = '39bd18d1-1111-4111-8111-111111111111';
    const input = { expenseDate: '2026-10-09', amount: '250', budgetCategory: 'lunch', description: 'Lunch', notes: 'Team', idempotencyKey: key };
    const first = await agent.post('/api/budget/expenses').send(input).expect(201);
    const retry = await agent.post('/api/budget/expenses').send(input).expect(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    await agent.put(`/api/budget/expenses/${key}`).send({ ...input, amount: '200' }).expect(200);
    await agent.put('/api/budget/overrides/2026-10-09').send({ plannedAmount: '180', note: 'Override' }).expect(200);
    await agent.put('/api/budget/days/2026-10-08/record-zero').send({ recorded: true }).expect(200);
    const updatedSettings = { ...DEFAULT_BUDGET_SETTINGS, weeklyFoodTarget: '1800.00' };
    await agent.put('/api/budget/settings').send(updatedSettings).expect(200);
    const workspace = await agent.get('/api/budget/2026-10?today=2026-10-09').expect(200);
    expect(workspace.body.data.days.find((day: { date: string }) => day.date === '2026-10-09')).toMatchObject({ planned: '180.00', actual: '200.00', status: 'over' });
    expect(workspace.body.data.days.find((day: { date: string }) => day.date === '2026-10-08').recordState).toBe('recorded_zero');
    await agent.delete(`/api/budget/expenses/${key}`).expect(200);
  });

  it('rejects invalid dates, zero expense amounts, and malformed identifiers', async () => {
    await agent.get('/api/budget/2026-13?today=2026-10-09').expect(400);
    await agent.post('/api/budget/expenses').send({ expenseDate: '2026-02-30', amount: '0', budgetCategory: 'lunch', description: 'x', idempotencyKey: 'bad' }).expect(400);
    await agent.delete('/api/budget/expenses/not-a-uuid').expect(400);
    const missingCategory = await agent.post('/api/budget/expenses').send({ expenseDate: '2026-10-09', amount: '10', budgetCategory: 'does-not-exist', description: 'x', idempotencyKey: '39bd18d1-2222-4222-8222-222222222222' }).expect(400);
    expect(missingCategory.body.error.code).toBe('BUDGET_CATEGORY_NOT_FOUND');
  });
});
