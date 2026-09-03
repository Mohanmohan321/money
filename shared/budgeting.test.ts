import { describe, expect, it } from 'vitest';

import { calculateBudgetSummary, categorizeTransaction } from './budgeting';

describe('budgeting domain', () => {
  it.each([
    ['Swiggy dinner', 'food'],
    ['Zomato lunch', 'food'],
    ['Neighborhood restaurant', 'food'],
    ['Weekly grocery', 'food'],
    ['Uber airport', 'travel'],
    ['Ola ride', 'travel'],
    ['Fuel stop', 'travel'],
    ['Train ticket', 'travel'],
    ['Flight booking', 'travel'],
    ['Amazon order', 'shopping'],
    ['Flipkart delivery', 'shopping'],
    ['City mall', 'shopping'],
    ['Cafe visit', 'coffee'],
    ['Coffee beans', 'coffee'],
    ['Starbucks', 'coffee'],
    ['Cinema tickets', 'entertainment'],
    ['Netflix', 'entertainment'],
    ['Spotify subscription', 'entertainment'],
    ['Video games', 'entertainment'],
    ['Apollo pharmacy', 'health'],
    ['Hospital visit', 'health'],
    ['Doctor appointment', 'health'],
    ['Medicine refill', 'health'],
    ['Electricity bill', 'bills'],
    ['Home internet', 'bills'],
    ['Phone recharge', 'bills'],
    ['Monthly rent', 'bills'],
    ['Notebook', 'other'],
  ] as const)('classifies %s as %s', (description, category) => {
    expect(categorizeTransaction(description)).toBe(category);
  });

  it.each([
    'Chocolate bar',
    'Parent transfer',
    'Small repair',
    'Billionaire documentary',
    'Border notebook',
  ])('does not classify keyword substrings inside unrelated words: %s', (description) => {
    expect(categorizeTransaction(description)).toBe('other');
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

  it('preserves cents across maximum-value income and spending arithmetic', () => {
    expect(calculateBudgetSummary({
      salary: '999999999999999999.99',
      additionalIncome: '999999999999999999.99',
      spending: '999999999999999999.99',
      savings: '0.01',
      spendingLimit: '0.00',
    })).toEqual({
      income: '1999999999999999999.98',
      spending: '999999999999999999.99',
      savings: '0.01',
      amountLeft: '999999999999999999.98',
      budgetScore: '0.00',
      spendingRemaining: '-999999999999999999.99',
    });
  });

  it('returns a zero score for zero income and preserves negative shortfalls', () => {
    expect(calculateBudgetSummary({
      salary: '0.00', additionalIncome: '0.00', spending: '10.00',
      savings: '5.00', spendingLimit: '4.00',
    })).toEqual({
      income: '0.00', spending: '10.00', savings: '5.00',
      amountLeft: '-15.00', budgetScore: '0.00', spendingRemaining: '-6.00',
    });
  });

  it.each([
    ['20.00', '100.00'],
    ['-1.00', '0.00'],
  ] as const)('clamps a %s savings score to %s', (savings, budgetScore) => {
    expect(calculateBudgetSummary({
      salary: '10.00', additionalIncome: '0.00', spending: '0.00',
      savings, spendingLimit: '0.00',
    }).budgetScore).toBe(budgetScore);
  });
});
