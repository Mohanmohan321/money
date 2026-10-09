import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  budgetCalendarDateSchema,
  createBudgetCalendarCategorySchema,
  createBudgetCalendarExpenseSchema,
  createBudgetCalendarRuleSchema,
} from './budget-calendar';

describe('budget calendar contracts', () => {
  it('normalizes a local dated expense and preserves optional text', () => {
    const input = createBudgetCalendarExpenseSchema.parse({
      expenseDate: '2026-10-09',
      categoryId: randomUUID(),
      amount: '250',
      description: ' Lunch ',
      notes: ' With colleagues ',
      idempotencyKey: randomUUID(),
    });

    expect(input).toEqual(expect.objectContaining({
      expenseDate: '2026-10-09',
      amount: '250.00',
      description: 'Lunch',
      notes: 'With colleagues',
    }));
  });

  it.each(['2026-02-30', '2025-02-29', '2026-13-01', '09-10-2026']) (
    'rejects invalid local calendar date %s',
    (date) => expect(() => budgetCalendarDateSchema.parse(date)).toThrow(),
  );

  it('accepts leap day and rejects zero, negative, or over-precise expense amounts', () => {
    expect(budgetCalendarDateSchema.parse('2024-02-29')).toBe('2024-02-29');
    const base = {
      expenseDate: '2026-10-09', categoryId: randomUUID(), idempotencyKey: randomUUID(),
    };
    for (const amount of ['0', '-1', '1.001']) {
      expect(() => createBudgetCalendarExpenseSchema.parse({ ...base, amount })).toThrow();
    }
  });

  it('accepts zero category allocations and validates schedule-specific fields', () => {
    expect(createBudgetCalendarCategorySchema.parse({
      name: 'Tea', group: 'other', monthlyAmount: '0', includedInOverallBudget: false,
    }).monthlyAmount).toBe('0.00');

    expect(() => createBudgetCalendarRuleSchema.parse({
      categoryId: randomUUID(), frequency: 'weekly', amount: '100', weekdays: [],
    })).toThrow();
    expect(() => createBudgetCalendarRuleSchema.parse({
      categoryId: randomUUID(), frequency: 'monthly', amount: '100', dayOfMonth: 32,
    })).toThrow();
  });
});
