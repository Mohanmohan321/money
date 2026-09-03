import Decimal from 'decimal.js';

import type { BudgetSummary, SpendingCategory } from './contracts';

const categoryKeywords: ReadonlyArray<readonly [SpendingCategory, readonly string[]]> = [
  ['food', ['swiggy', 'zomato', 'restaurant', 'groceries', 'food']],
  ['travel', ['uber', 'ola', 'airport', 'flight', 'train', 'metro', 'travel']],
  ['shopping', ['amazon', 'flipkart', 'shopping', 'myntra', 'order']],
  ['coffee', ['starbucks', 'coffee', 'cafe']],
  ['entertainment', ['netflix', 'prime video', 'spotify', 'movie', 'cinema']],
  ['health', ['apollo', 'pharmacy', 'medicine', 'hospital', 'doctor']],
  ['bills', ['electricity', 'internet', 'rent', 'bill', 'water']],
];

export function categorizeTransaction(description: string): SpendingCategory {
  const normalized = description.toLocaleLowerCase();
  for (const [category, keywords] of categoryKeywords) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category;
  }
  return 'other';
}

export function calculateBudgetSummary(input: {
  salary: string; additionalIncome: string; spending: string; savings: string; spendingLimit: string;
}): BudgetSummary {
  const income = new Decimal(input.salary).plus(input.additionalIncome);
  const spending = new Decimal(input.spending);
  const savings = new Decimal(input.savings);
  const score = income.isZero() ? new Decimal(0) : savings.div(income).mul(100);
  return {
    income: income.toFixed(2), spending: spending.toFixed(2), savings: savings.toFixed(2),
    amountLeft: income.minus(spending).minus(savings).toFixed(2),
    budgetScore: Decimal.max(0, Decimal.min(100, score)).toFixed(2),
    spendingRemaining: new Decimal(input.spendingLimit).minus(spending).toFixed(2),
  };
}
