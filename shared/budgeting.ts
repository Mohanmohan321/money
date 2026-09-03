import Decimal from 'decimal.js';

import type { BudgetSummary, SpendingCategory } from './contracts';

const categoryKeywords: ReadonlyArray<readonly [SpendingCategory, readonly string[]]> = [
  ['food', ['swiggy', 'zomato', 'restaurant', 'grocery', 'groceries', 'food']],
  ['travel', ['uber', 'ola', 'airport', 'fuel', 'flight', 'train', 'metro', 'travel']],
  ['shopping', ['amazon', 'flipkart', 'mall', 'shopping', 'myntra', 'order']],
  ['coffee', ['starbucks', 'coffee', 'cafe']],
  ['entertainment', ['netflix', 'prime video', 'spotify', 'games', 'movie', 'cinema']],
  ['health', ['apollo', 'pharmacy', 'medicine', 'hospital', 'doctor']],
  ['bills', ['electricity', 'internet', 'phone', 'rent', 'bill', 'water']],
];

function keywordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`);
}

export function categorizeTransaction(description: string): SpendingCategory {
  const normalized = description.toLowerCase();
  for (const [category, keywords] of categoryKeywords) {
    if (keywords.some((keyword) => keywordPattern(keyword).test(normalized))) return category;
  }
  return 'other';
}

function calculationPrecision(values: string[]): number {
  const widestOperand = Math.max(1, ...values.map((value) => {
    const significantDigits = value
      .replace(/^[+-]/, '')
      .replace('.', '')
      .replace(/^0+/, '');
    return significantDigits.length;
  }));
  return Math.max(16, widestOperand + 4);
}

export function calculateBudgetSummary(input: {
  salary: string; additionalIncome: string; spending: string; savings: string; spendingLimit: string;
}): BudgetSummary {
  const MoneyDecimal = Decimal.clone({
    precision: calculationPrecision(Object.values(input)),
  });
  const income = new MoneyDecimal(input.salary).plus(input.additionalIncome);
  const spending = new MoneyDecimal(input.spending);
  const savings = new MoneyDecimal(input.savings);
  const score = income.isZero() ? new MoneyDecimal(0) : savings.div(income).mul(100);
  return {
    income: income.toFixed(2), spending: spending.toFixed(2), savings: savings.toFixed(2),
    amountLeft: income.minus(spending).minus(savings).toFixed(2),
    budgetScore: MoneyDecimal.max(0, MoneyDecimal.min(100, score)).toFixed(2),
    spendingRemaining: new MoneyDecimal(input.spendingLimit).minus(spending).toFixed(2),
  };
}
