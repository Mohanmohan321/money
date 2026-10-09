import { describe, expect, it } from 'vitest';
import { transactionLocalExpenseDate } from './drizzle-budget-workspace-store';

describe('budget transaction local dates', () => {
  it('preserves explicit dates and derives legacy rows in the application timezone', () => {
    expect(transactionLocalExpenseDate({ expenseDate: '2026-10-09', createdAt: new Date('2026-10-08T18:00:00.000Z') }, 'Asia/Kolkata')).toBe('2026-10-09');
    expect(transactionLocalExpenseDate({ expenseDate: null, createdAt: new Date('2026-10-08T20:00:00.000Z') }, 'Asia/Kolkata')).toBe('2026-10-09');
    expect(transactionLocalExpenseDate({ expenseDate: null, createdAt: new Date('2026-10-08T17:00:00.000Z') }, 'Asia/Kolkata')).toBe('2026-10-08');
  });
});
