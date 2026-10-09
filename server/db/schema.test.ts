import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  assets,
  budgetCalendarCategories,
  budgetCalendarDayRecords,
  budgetCalendarExpenses,
  budgetCalendarMonths,
  budgetCalendarOverrides,
  budgetCalendarRules,
  budgetCalendarSettings,
  budgetDateOverrides,
  budgetDayRecords,
  budgetSettings,
  income,
  liabilities,
  monthlyBudgets,
  subscriptionReviews,
  transactions,
  vaultContributions,
  vaults,
} from './schema';

describe('budgeting schema', () => {
  it('exports every persistent budgeting column', () => {
    expect(Object.keys(getTableColumns(monthlyBudgets))).toEqual(['month', 'salary', 'spendingLimit', 'savingsTarget', 'createdAt', 'updatedAt']);
    expect(Object.keys(getTableColumns(income))).toContain('category');
    expect(Object.keys(getTableColumns(transactions))).toContain('category');
    expect(Object.keys(getTableColumns(transactions))).toEqual(expect.arrayContaining([
      'expenseDate', 'budgetCategory', 'notes', 'idempotencyKey', 'updatedAt',
    ]));
    expect(Object.keys(getTableColumns(budgetSettings))).toEqual([
      'id', 'overallMonthlyLimit', 'weeklyFoodTarget', 'weekStart', 'categories', 'createdAt', 'updatedAt',
    ]);
    expect(Object.keys(getTableColumns(budgetDateOverrides))).toContain('plannedAmount');
    expect(Object.keys(getTableColumns(budgetDayRecords))).toContain('recordedZero');
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

  it('declares a separate prefixed budget calendar schema without adding its fields to transactions', () => {
    expect([
      budgetCalendarSettings,
      budgetCalendarCategories,
      budgetCalendarMonths,
      budgetCalendarRules,
      budgetCalendarOverrides,
      budgetCalendarExpenses,
      budgetCalendarDayRecords,
    ].map(getTableName)).toEqual([
      'budget_calendar_settings',
      'budget_calendar_categories',
      'budget_calendar_months',
      'budget_calendar_rules',
      'budget_calendar_overrides',
      'budget_calendar_expenses',
      'budget_calendar_day_records',
    ]);
    expect(Object.keys(getTableColumns(transactions))).toEqual([
      'id', 'description', 'category', 'amount', 'expenseDate', 'budgetCategory',
      'notes', 'idempotencyKey', 'createdAt', 'updatedAt',
    ]);
  });

  it('constrains isolated money, date, status, and idempotency fields', () => {
    expect(Object.keys(getTableColumns(budgetCalendarCategories))).toEqual([
      'id', 'seedKey', 'name', 'group', 'monthlyAmount', 'includedInOverallBudget',
      'active', 'sortOrder', 'createdAt', 'updatedAt',
    ]);
    expect(Object.keys(getTableColumns(budgetCalendarExpenses))).toEqual([
      'id', 'expenseDate', 'categoryId', 'amount', 'description', 'notes',
      'idempotencyKey', 'createdAt', 'updatedAt',
    ]);
    expect(getTableConfig(budgetCalendarExpenses).checks.map(({ name }) => name))
      .toContain('budget_calendar_expenses_amount_positive');
    expect(getTableConfig(budgetCalendarCategories).checks.map(({ name }) => name))
      .toEqual(expect.arrayContaining([
        'budget_calendar_categories_amount_non_negative',
        'budget_calendar_categories_group_valid',
      ]));
    expect(getTableConfig(budgetCalendarRules).checks.map(({ name }) => name))
      .toEqual(expect.arrayContaining([
        'budget_calendar_rules_frequency_valid',
        'budget_calendar_rules_amount_non_negative',
      ]));
  });
});
