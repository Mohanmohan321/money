import { describe, expect, it } from 'vitest';

import { calculateBudgetSummary, categorizeTransaction } from './budgeting';

describe('budgeting domain', () => {
  it.each([
    ['Swiggy dinner', 'food'],
    ['Uber airport', 'travel'],
    ['Amazon order', 'shopping'],
    ['Starbucks', 'coffee'],
    ['Netflix', 'entertainment'],
    ['Apollo pharmacy', 'health'],
    ['Electricity bill', 'bills'],
    ['Notebook', 'other'],
  ] as const)('classifies %s as %s', (description, category) => {
    expect(categorizeTransaction(description)).toBe(category);
  });

  it('calculates the server-facing budget summary with Decimal values', () => {
    expect(calculateBudgetSummary({
      salary: '50000.00', additionalIncome: '5000.00', spending: '12000.00',
      savings: '10000.00', spendingLimit: '20000.00',
    })).toEqual({
      income: '55000.00', spending: '12000.00', savings: '10000.00',
      amountLeft: '33000.00', budgetScore: '18.18', spendingRemaining: '8000.00',
    });
  });
});
