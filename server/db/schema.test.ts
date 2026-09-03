import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { assets, income, liabilities, monthlyBudgets, transactions, vaultContributions, vaults } from './schema';

describe('budgeting schema', () => {
  it('exports every persistent budgeting column', () => {
    expect(Object.keys(getTableColumns(monthlyBudgets))).toEqual(['month', 'salary', 'spendingLimit', 'savingsTarget', 'createdAt', 'updatedAt']);
    expect(Object.keys(getTableColumns(income))).toContain('category');
    expect(Object.keys(getTableColumns(transactions))).toContain('category');
    expect(Object.keys(getTableColumns(vaults))).toContain('targetAmount');
    expect(Object.keys(getTableColumns(vaultContributions))).toContain('vaultId');
    expect(Object.keys(getTableColumns(assets))).toContain('currentValue');
    expect(Object.keys(getTableColumns(liabilities))).toContain('outstandingBalance');
  });

  it('requires canonical months and does not default new transaction categories', () => {
    expect(getTableConfig(monthlyBudgets).checks.map((constraint) => constraint.name))
      .toContain('monthly_budgets_month_format');
    expect(getTableConfig(transactions).columns.find((column) => column.name === 'category')?.default)
      .toBeUndefined();
  });
});
