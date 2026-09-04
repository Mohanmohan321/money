import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { assets, income, liabilities, monthlyBudgets, subscriptionReviews, transactions, vaultContributions, vaults } from './schema';

describe('budgeting schema', () => {
  it('exports every persistent budgeting column', () => {
    expect(Object.keys(getTableColumns(monthlyBudgets))).toEqual(['month', 'salary', 'spendingLimit', 'savingsTarget', 'createdAt', 'updatedAt']);
    expect(Object.keys(getTableColumns(income))).toContain('category');
    expect(Object.keys(getTableColumns(transactions))).toContain('category');
    expect(Object.keys(getTableColumns(vaults))).toContain('targetAmount');
    expect(Object.keys(getTableColumns(vaultContributions))).toContain('vaultId');
    expect(Object.keys(getTableColumns(assets))).toContain('currentValue');
    expect(Object.keys(getTableColumns(liabilities))).toContain('outstandingBalance');
    expect(Object.keys(getTableColumns(subscriptionReviews))).toEqual([
      'merchantKey', 'status', 'cadence', 'representativeAmount', 'supportingTransactionIds',
      'nextExpectedAt', 'createdAt', 'updatedAt',
    ]);
  });

  it('requires canonical months and does not default new transaction categories', () => {
    expect(getTableConfig(monthlyBudgets).checks.map((constraint) => constraint.name))
      .toContain('monthly_budgets_month_format');
    expect(getTableConfig(transactions).columns.find((column) => column.name === 'category')?.default)
      .toBeUndefined();
    expect(getTableConfig(subscriptionReviews).checks.map((constraint) => constraint.name)).toEqual(expect.arrayContaining([
      'subscription_reviews_amount_positive', 'subscription_reviews_status_valid', 'subscription_reviews_cadence_valid',
    ]));
  });
});
