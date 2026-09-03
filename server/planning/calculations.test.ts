import { describe, expect, it } from 'vitest';

import {
  buildAnnualReport,
  buildPlanningBudgets,
  fillBudgetDays,
  fillBudgetMonths,
  fillCategorySpending,
  percentageOf,
  selectExtremeMonth,
} from './drizzle-planning-store';

describe('planning calculations', () => {
  it('derives saved and suggested annual budgets from one ordered batch', () => {
    const budgets = buildPlanningBudgets('2026', [
      {
        month: '2025-11', salary: '100.00', spendingLimit: '80.00', savingsTarget: '20.00',
        updatedAt: new Date('2025-11-15T00:00:00.000Z'),
      },
      {
        month: '2026-02', salary: '200.00', spendingLimit: '150.00', savingsTarget: '50.00',
        updatedAt: new Date('2026-02-15T00:00:00.000Z'),
      },
      {
        month: '2026-05', salary: '300.00', spendingLimit: '220.00', savingsTarget: '80.00',
        updatedAt: new Date('2026-05-15T00:00:00.000Z'),
      },
    ]);

    expect(budgets[0]).toEqual({
      month: '2026-01', salary: '100.00', spendingLimit: '80.00',
      savingsTarget: '20.00', source: 'suggested',
    });
    expect(budgets[1]).toEqual({
      month: '2026-02', salary: '200.00', spendingLimit: '150.00',
      savingsTarget: '50.00', source: 'saved', updatedAt: '2026-02-15T00:00:00.000Z',
    });
    expect(budgets[2]).toEqual({
      month: '2026-03', salary: '200.00', spendingLimit: '150.00',
      savingsTarget: '50.00', source: 'suggested',
    });
    expect(budgets[4]).toEqual({
      month: '2026-05', salary: '300.00', spendingLimit: '220.00',
      savingsTarget: '80.00', source: 'saved', updatedAt: '2026-05-15T00:00:00.000Z',
    });
    expect(budgets[11]).toEqual({
      month: '2026-12', salary: '300.00', spendingLimit: '220.00',
      savingsTarget: '80.00', source: 'suggested',
    });
  });

  it('returns zero suggestions when the budget batch is empty', () => {
    expect(buildPlanningBudgets('2026', [])[0]).toEqual({
      month: '2026-01', salary: '0.00', spendingLimit: '0.00',
      savingsTarget: '0.00', source: 'suggested',
    });
    expect(buildPlanningBudgets('2026', [])).toHaveLength(12);
  });

  it('zero-fills every day in a leap-year February and preserves populated activity', () => {
    const days = fillBudgetDays(
      new Date('2028-02-01T00:00:00.000Z'),
      new Date('2028-03-01T00:00:00.000Z'),
      'UTC',
      [{
        date: '2028-02-29', income: '10.00', spending: '2.00', savings: '3.00',
        activity: [], vaultContributionCount: 1, subscriptionPaymentCount: 0,
      }],
    );

    expect(days).toHaveLength(29);
    expect(days[0]).toEqual({
      date: '2028-02-01', income: '0.00', spending: '0.00', savings: '0.00',
      activity: [], vaultContributionCount: 0, subscriptionPaymentCount: 0,
    });
    expect(days[28]).toEqual({
      date: '2028-02-29', income: '10.00', spending: '2.00', savings: '3.00',
      activity: [], vaultContributionCount: 1, subscriptionPaymentCount: 0,
    });
  });

  it('zero-fills an empty year in January-December order', () => {
    const months = fillBudgetMonths('2026', []);

    expect(months).toHaveLength(12);
    expect(months.map((month) => month.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
    expect(months.every((month) => (
      month.income === '0.00'
      && month.spending === '0.00'
      && month.savings === '0.00'
      && month.amountLeft === '0.00'
      && month.budgetUsage === '0.00'
    ))).toBe(true);
  });

  it('preserves a negative amount left and calculates budget usage', () => {
    const september = fillBudgetMonths('2026', [{
      month: '2026-09', salary: '10.00', additionalIncome: '0.00', spending: '15.00',
      savings: '1.00', spendingLimit: '5.00',
    }])[8];

    expect(september).toEqual({
      month: '2026-09', income: '10.00', spending: '15.00', savings: '1.00',
      amountLeft: '-6.00', budgetUsage: '300.00',
    });
  });

  it('returns 0.00 for a zero percentage denominator and rounds exact ratios', () => {
    expect(percentageOf('123.45', '0.00')).toBe('0.00');
    expect(percentageOf('1.00', '3.00')).toBe('33.33');
    expect(percentageOf('999949999999999999.99', '999999999999999999.99')).toBe('99.99');
  });

  it('returns all eight spending categories in stable taxonomy order', () => {
    expect(fillCategorySpending([
      { category: 'other', amount: '5.00' },
      { category: 'food', amount: '15.00' },
    ], '20.00')).toEqual([
      { category: 'food', amount: '15.00', percentage: '75.00' },
      { category: 'travel', amount: '0.00', percentage: '0.00' },
      { category: 'shopping', amount: '0.00', percentage: '0.00' },
      { category: 'coffee', amount: '0.00', percentage: '0.00' },
      { category: 'entertainment', amount: '0.00', percentage: '0.00' },
      { category: 'health', amount: '0.00', percentage: '0.00' },
      { category: 'bills', amount: '0.00', percentage: '0.00' },
      { category: 'other', amount: '5.00', percentage: '25.00' },
    ]);
  });

  it('selects numeric extremes with earliest-month tie breaking', () => {
    const months = fillBudgetMonths('2026', [
      { month: '2026-02', salary: '0.00', additionalIncome: '0.00', spending: '20.00', savings: '8.00', spendingLimit: '0.00' },
      { month: '2026-01', salary: '0.00', additionalIncome: '0.00', spending: '20.00', savings: '8.00', spendingLimit: '0.00' },
      { month: '2026-03', salary: '0.00', additionalIncome: '0.00', spending: '2.00', savings: '3.00', spendingLimit: '0.00' },
    ]);

    expect(selectExtremeMonth(months, 'spending', 'max')).toBe('2026-01');
    expect(selectExtremeMonth(months, 'savings', 'max')).toBe('2026-01');
    expect(selectExtremeMonth([], 'spending', 'max')).toBeUndefined();
  });

  it('builds annual salary/source totals and keeps earliest ties stable', () => {
    const report = buildAnnualReport('2026', [
      { month: '2026-01', salary: '100.00', additionalIncome: '20.00', spending: '50.00', savings: '10.00', spendingLimit: '80.00' },
      { month: '2026-02', salary: '100.00', additionalIncome: '30.00', spending: '50.00', savings: '10.00', spendingLimit: '80.00' },
    ], [
      { category: 'food', amount: '60.00' },
      { category: 'other', amount: '40.00' },
    ], [
      { source: 'Contract', amount: '50.00' },
    ]);

    expect(report.summary).toEqual({
      income: '250.00', spending: '100.00', savings: '20.00', amountLeft: '130.00',
      budgetScore: '8.00', spendingRemaining: '60.00',
    });
    expect(report.incomeBySource).toEqual([
      { source: 'Salary', amount: '200.00', percentage: '80.00' },
      { source: 'Contract', amount: '50.00', percentage: '20.00' },
    ]);
    expect(report.highestSpendingMonth).toBe('2026-01');
    expect(report.bestSavingMonth).toBe('2026-01');
  });

  it('combines an additional income source named Salary with configured salary', () => {
    const report = buildAnnualReport('2026', [{
      month: '2026-01', salary: '100.00', additionalIncome: '25.00', spending: '0.00',
      savings: '0.00', spendingLimit: '0.00',
    }], [], [
      { source: 'Salary', amount: '25.00' },
    ]);

    expect(report.incomeBySource).toEqual([
      { source: 'Salary', amount: '125.00', percentage: '100.00' },
    ]);
  });
});
