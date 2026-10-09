import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import type { AppDatabase } from '../db/client';
import { DrizzleBudgetCalendarStore } from './drizzle-budget-calendar-store';

const now = new Date('2026-10-09T00:00:00.000Z');
const categoryRow = {
  id: '00000000-0000-4000-8000-000000000101', seedKey: 'lunch', name: 'Lunch',
  group: 'meal', monthlyAmount: '2400.00', includedInOverallBudget: true,
  active: true, sortOrder: 10, createdAt: now, updatedAt: now,
};

function emitted(statement: SQL): string {
  return new PgDialect().sqlToQuery(statement).sql.toLowerCase();
}

describe('DrizzleBudgetCalendarStore configuration', () => {
  it('loads settings and categories only from isolated tables', async () => {
    const statements: SQL[] = [];
    const execute = vi.fn(async (statement: SQL) => {
      statements.push(statement);
      if (emitted(statement).includes('budget_calendar_settings')) {
        return { rows: [{ weekStart: 1, weeklyFoodTarget: '1900.00', createdAt: now, updatedAt: now }] };
      }
      return { rows: [categoryRow] };
    });
    const store = new DrizzleBudgetCalendarStore({ execute } as unknown as AppDatabase);

    await expect(store.getSettings()).resolves.toEqual({
      weekStart: 1, weeklyFoodTarget: '1900.00',
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
    await expect(store.listCategories()).resolves.toEqual([{
      ...categoryRow, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    }]);

    expect(statements).toHaveLength(2);
    const sqlText = statements.map(emitted).join('\n');
    expect(sqlText).toContain('budget_calendar_settings');
    expect(sqlText).toContain('budget_calendar_categories');
    expect(sqlText).not.toMatch(/from "transactions"|from "monthly_budgets"/);
  });

  it('creates a stable month snapshot from active category settings when absent', async () => {
    const statements: SQL[] = [];
    const execute = vi.fn(async (statement: SQL) => {
      statements.push(statement);
      const text = emitted(statement);
      if (text.trimStart().startsWith('select') && text.includes('budget_calendar_months')) return { rows: [] };
      if (text.trimStart().startsWith('select') && text.includes('budget_calendar_categories')) {
        return { rows: [categoryRow] };
      }
      return {
        rows: [{
          month: '2026-10', overallLimit: '2400.00',
          configurationSnapshot: [{
            categoryId: categoryRow.id, name: 'Lunch', group: 'meal', monthlyAmount: '2400.00',
            includedInOverallBudget: true, sortOrder: 10,
          }],
          createdAt: now, updatedAt: now,
        }],
      };
    });

    const result = await new DrizzleBudgetCalendarStore({ execute } as unknown as AppDatabase)
      .getMonth('2026-10');

    expect(result).toEqual({
      month: '2026-10', overallLimit: '2400.00',
      categories: [{
        categoryId: categoryRow.id, name: 'Lunch', group: 'meal', monthlyAmount: '2400.00',
        includedInOverallBudget: true, sortOrder: 10,
      }],
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
    expect(statements).toHaveLength(3);
    expect(emitted(statements[2])).toContain('insert into budget_calendar_months');
  });

  it('archives a referenced category with one isolated atomic statement', async () => {
    const statements: SQL[] = [];
    const execute = vi.fn(async (statement: SQL) => {
      statements.push(statement);
      return { rows: [{ outcome: 'archived' }] };
    });
    const store = new DrizzleBudgetCalendarStore({ execute } as unknown as AppDatabase);

    await expect(store.archiveCategory(categoryRow.id)).resolves.toBe('archived');
    expect(statements).toHaveLength(1);
    const text = emitted(statements[0]);
    expect(text).toContain('budget_calendar_expenses');
    expect(text).toContain('budget_calendar_rules');
    expect(text).not.toMatch(/transactions|monthly_budgets/);
  });

  it('replays an idempotency key from one isolated expense statement', async () => {
    const statements: SQL[] = [];
    const execute = vi.fn(async (statement: SQL) => {
      statements.push(statement);
      return { rows: [{
        id: '00000000-0000-4000-8000-000000000301',
        expenseDate: '2026-10-09', categoryId: categoryRow.id, categoryName: 'Lunch',
        amount: '250.00', description: 'Lunch', notes: null,
        idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
        createdAt: now, updatedAt: now, created: false,
      }] };
    });
    const store = new DrizzleBudgetCalendarStore({ execute } as unknown as AppDatabase);

    await expect(store.createExpense({
      expenseDate: '2026-10-09', categoryId: categoryRow.id, amount: '250.00',
      description: 'Lunch', idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
    })).resolves.toEqual({
      outcome: 'replayed',
      expense: {
        id: '00000000-0000-4000-8000-000000000301',
        expenseDate: '2026-10-09', categoryId: categoryRow.id, categoryName: 'Lunch',
        amount: '250.00', description: 'Lunch',
        idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      },
    });
    expect(statements).toHaveLength(1);
    const text = emitted(statements[0]);
    expect(text).toContain('budget_calendar_expenses');
    expect(text).toContain('budget_calendar_day_records');
    expect(text).not.toMatch(/transactions|monthly_budgets/);
  });
});
