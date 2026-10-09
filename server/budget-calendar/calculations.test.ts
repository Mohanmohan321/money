import { describe, expect, it } from 'vitest';

import type { BudgetCalendarExpense, BudgetCalendarRule } from '../../shared/budget-calendar';
import {
  aggregateBudgetMonth,
  buildPlannedDays,
  calculateDayBudget,
  calculatePlanningDiscrepancy,
  monthDates,
} from './calculations';

describe('budget calendar calculations', () => {
  it.each([
    ['200.00', '150.00', '50.00', '-50.00', '75.00', 'under'],
    ['200.00', '200.00', '0.00', '0.00', '100.00', 'on'],
    ['200.00', '250.00', '-50.00', '50.00', '125.00', 'over'],
  ] as const)('calculates exact day status for planned %s and actual %s', (
    planned, actual, remaining, variance, utilization, status,
  ) => {
    expect(calculateDayBudget({ planned, actual, recorded: true, future: false }))
      .toEqual({ remaining, variance, utilization, status });
  });

  it('handles missing, future, and zero planned days without dividing by zero', () => {
    expect(calculateDayBudget({ planned: '200.00', actual: '0.00', recorded: false, future: false }).status)
      .toBe('missing');
    expect(calculateDayBudget({ planned: '200.00', actual: '0.00', recorded: false, future: true }).status)
      .toBe('future');
    expect(calculateDayBudget({ planned: '0.00', actual: '0.00', recorded: true, future: false }))
      .toEqual({ remaining: '0.00', variance: '0.00', utilization: '0.00', status: 'on' });
    expect(calculateDayBudget({ planned: '0.00', actual: '50.00', recorded: true, future: false }))
      .toEqual({ remaining: '-50.00', variance: '50.00', utilization: null, status: 'over' });
  });

  it('enumerates real month lengths including leap years', () => {
    expect(monthDates('2024-02')).toHaveLength(29);
    expect(monthDates('2025-02')).toHaveLength(28);
    expect(monthDates('2026-04')).toHaveLength(30);
    expect(monthDates('2026-10')).toHaveLength(31);
    expect(monthDates('2024-02').at(-1)).toBe('2024-02-29');
  });

  it('applies active schedules and lets an override replace the calculated total', () => {
    const rules: BudgetCalendarRule[] = [
      {
        id: '00000000-0000-4000-8000-000000000101',
        categoryId: '00000000-0000-4000-8000-000000000201',
        frequency: 'daily', amount: '10.00', weekdays: [], activeFrom: '2026-10-02',
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        categoryId: '00000000-0000-4000-8000-000000000202',
        frequency: 'weekly', amount: '50.00', weekdays: [5],
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000103',
        categoryId: '00000000-0000-4000-8000-000000000203',
        frequency: 'monthly', amount: '500.00', weekdays: [], dayOfMonth: 31,
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];

    const days = buildPlannedDays({
      month: '2026-10', rules,
      overrides: [{ date: '2026-10-09', plannedAmount: '200.00' }],
    });

    expect(days.find(({ date }) => date === '2026-10-01')).toEqual({
      date: '2026-10-01', plannedAmount: '0.00', planSource: 'calculated',
    });
    expect(days.find(({ date }) => date === '2026-10-02')?.plannedAmount).toBe('60.00');
    expect(days.find(({ date }) => date === '2026-10-09')).toEqual({
      date: '2026-10-09', plannedAmount: '200.00', planSource: 'override',
    });
    expect(days.find(({ date }) => date === '2026-10-31')?.plannedAmount).toBe('510.00');
  });

  it('aggregates multiple expenses while preserving missing versus explicit zero', () => {
    const expenses: BudgetCalendarExpense[] = [
      {
        id: '00000000-0000-4000-8000-000000000301', expenseDate: '2026-10-09',
        categoryId: '00000000-0000-4000-8000-000000000401', categoryName: 'Lunch',
        amount: '150.00', idempotencyKey: '00000000-0000-4000-8000-000000000501',
        createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000302', expenseDate: '2026-10-09',
        categoryId: '00000000-0000-4000-8000-000000000402', categoryName: 'Snacks',
        amount: '100.00', idempotencyKey: '00000000-0000-4000-8000-000000000502',
        createdAt: '2026-10-09T11:00:00.000Z', updatedAt: '2026-10-09T11:00:00.000Z',
      },
    ];
    const result = aggregateBudgetMonth({
      month: '2026-10', today: '2026-10-10', overallLimit: '10000.00',
      plannedDays: monthDates('2026-10').map((date) => ({
        date, plannedAmount: date <= '2026-10-10' ? '200.00' : '0.00', planSource: 'calculated' as const,
      })),
      expenses,
      recordedZeroDates: new Set(['2026-10-08']),
    });

    expect(result.days.find(({ date }) => date === '2026-10-09')).toEqual(expect.objectContaining({
      actualAmount: '250.00', remaining: '-50.00', status: 'over',
      recordState: 'recorded_with_expenses',
    }));
    expect(result.days.find(({ date }) => date === '2026-10-08')).toEqual(expect.objectContaining({
      actualAmount: '0.00', status: 'under', recordState: 'recorded_zero',
    }));
    expect(result.days.find(({ date }) => date === '2026-10-07')?.recordState).toBe('missing');
    expect(result.summary).toEqual(expect.objectContaining({
      monthlyBudget: '10000.00', actualSpending: '250.00', remaining: '9750.00',
      utilization: '2.50', recordedDayAverage: '125.00', overBudgetDays: 1, underBudgetDays: 1,
    }));
  });

  it('reports the weekly target discrepancy without changing either value', () => {
    expect(calculatePlanningDiscrepancy('5280.00', '1900.00')).toEqual({
      mealAllocation: '5280.00', weeklyFoodTarget: '1900.00', fourWeekTarget: '7600.00',
      difference: '2320.00', hasDiscrepancy: true,
    });
  });
});
