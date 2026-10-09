import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BUDGET_SETTINGS,
  buildBudgetMonth,
  calculateBudgetPosition,
  monthDates,
} from './budget-workspace';

describe('budget workspace calculations', () => {
  it('seeds the editable allocation without double-counting planning references', () => {
    expect(DEFAULT_BUDGET_SETTINGS.categories.reduce((sum, item) => sum + Number(item.monthlyAmount), 0)).toBe(10_000);
    expect(DEFAULT_BUDGET_SETTINGS.categories.filter((item) => item.group === 'grocery').reduce((sum, item) => sum + Number(item.monthlyAmount), 0)).toBe(2_020);
    expect(DEFAULT_BUDGET_SETTINGS.categories.filter((item) => item.group === 'meal').reduce((sum, item) => sum + Number(item.monthlyAmount), 0)).toBe(5_280);
    expect(DEFAULT_BUDGET_SETTINGS.weeklyFoodTarget).toBe('1900.00');
  });

  it.each([
    [{ planned: '200.00', actual: '150.00', recorded: true }, { remaining: '50.00', variance: '-50.00', utilization: '75.00', status: 'under' }],
    [{ planned: '200.00', actual: '200.00', recorded: true }, { remaining: '0.00', variance: '0.00', utilization: '100.00', status: 'on' }],
    [{ planned: '200.00', actual: '250.00', recorded: true }, { remaining: '-50.00', variance: '50.00', utilization: '125.00', status: 'over' }],
    [{ planned: '0.00', actual: '20.00', recorded: true }, { remaining: '-20.00', variance: '20.00', utilization: null, status: 'over' }],
    [{ planned: '200.00', actual: '0.00', recorded: false }, { remaining: '200.00', variance: '-200.00', utilization: '0.00', status: 'missing' }],
  ] as const)('calculates exact position %#', (input, expected) => {
    expect(calculateBudgetPosition(input)).toEqual(expected);
  });

  it('handles leap and non-leap February as local calendar dates', () => {
    expect(monthDates('2024-02')).toHaveLength(29);
    expect(monthDates('2025-02')).toHaveLength(28);
    expect(monthDates('2026-10')).toEqual(expect.arrayContaining(['2026-10-09']));
  });

  it('aggregates multiple expenses, explicit zero, missing data, overrides, and weekly ranges', () => {
    const result = buildBudgetMonth({
      month: '2026-10',
      today: '2026-10-09',
      settings: DEFAULT_BUDGET_SETTINGS,
      overrides: [{ date: '2026-10-09', plannedAmount: '200.00', note: 'Training day' }],
      explicitZeroDates: ['2026-10-08'],
      expenses: [
        { id: 'a', expenseDate: '2026-10-09', amount: '150.00', budgetCategory: 'lunch', description: 'Lunch', notes: null, createdAt: '2026-10-09T06:00:00.000Z', updatedAt: '2026-10-09T06:00:00.000Z' },
        { id: 'b', expenseDate: '2026-10-09', amount: '100.00', budgetCategory: 'snacks', description: 'Snacks', notes: null, createdAt: '2026-10-09T07:00:00.000Z', updatedAt: '2026-10-09T07:00:00.000Z' },
      ],
    });
    const eighth = result.days.find((day) => day.date === '2026-10-08');
    const ninth = result.days.find((day) => day.date === '2026-10-09');
    const tenth = result.days.find((day) => day.date === '2026-10-10');
    expect(eighth?.recordState).toBe('recorded_zero');
    expect(ninth).toMatchObject({ planned: '200.00', actual: '250.00', remaining: '-50.00', status: 'over', recordState: 'recorded_with_expenses', plannedSource: 'override' });
    expect(tenth?.status).toBe('future');
    expect(result.weeks[0]).toMatchObject({ from: '2026-09-28', to: '2026-10-04' });
    expect(result.summary.actual).toBe('250.00');
  });
});
