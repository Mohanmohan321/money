import { getTableColumns } from 'drizzle-orm';
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
});
