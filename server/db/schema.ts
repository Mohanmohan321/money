import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type { BudgetCategoryConfig } from '../../shared/budget-workspace';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

const money = (name: string) => numeric(name, { precision: 20, scale: 2 }).notNull();

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    description: text('description').notNull(),
    category: varchar('category', { length: 24 }).notNull(),
    amount: money('amount'),
    expenseDate: date('expense_date', { mode: 'string' }),
    budgetCategory: varchar('budget_category', { length: 80 }),
    notes: varchar('notes', { length: 500 }),
    idempotencyKey: uuid('idempotency_key').unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('transactions_amount_positive', sql`${table.amount} > 0`),
    index('transactions_created_at_idx').on(table.createdAt),
    index('transactions_expense_date_idx').on(table.expenseDate),
  ],
);

export const budgetSettings = pgTable(
  'budget_settings',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    overallMonthlyLimit: money('overall_monthly_limit'),
    weeklyFoodTarget: money('weekly_food_target'),
    weekStart: integer('week_start').notNull().default(1),
    categories: jsonb('categories').$type<BudgetCategoryConfig[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('budget_settings_limit_non_negative', sql`${table.overallMonthlyLimit} >= 0`),
    check('budget_settings_weekly_food_non_negative', sql`${table.weeklyFoodTarget} >= 0`),
    check('budget_settings_week_start_monday', sql`${table.weekStart} = 1`),
  ],
);

export const budgetDateOverrides = pgTable(
  'budget_date_overrides',
  {
    date: date('date', { mode: 'string' }).primaryKey(),
    plannedAmount: money('planned_amount'),
    note: varchar('note', { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('budget_date_overrides_amount_non_negative', sql`${table.plannedAmount} >= 0`)],
);

export const budgetDayRecords = pgTable('budget_day_records', {
  date: date('date', { mode: 'string' }).primaryKey(),
  recordedZero: boolean('recorded_zero').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const monthlyBudgets = pgTable(
  'monthly_budgets',
  {
    month: varchar('month', { length: 7 }).primaryKey(),
    salary: money('salary'),
    spendingLimit: money('spending_limit'),
    savingsTarget: money('savings_target'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('monthly_budgets_month_format', sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('monthly_budgets_salary_non_negative', sql`${table.salary} >= 0`),
    check('monthly_budgets_spending_limit_non_negative', sql`${table.spendingLimit} >= 0`),
    check('monthly_budgets_savings_target_non_negative', sql`${table.savingsTarget} >= 0`),
  ],
);

export const income = pgTable(
  'income',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    category: varchar('category', { length: 24 }).notNull(),
    amount: money('amount'),
    createdAt: createdAt(),
  },
  (table) => [
    check('income_amount_positive', sql`${table.amount} > 0`),
    index('income_created_at_idx').on(table.createdAt),
  ],
);

export const vaults = pgTable(
  'vaults',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    emoji: varchar('emoji', { length: 16 }).notNull(),
    targetAmount: money('target_amount'),
    targetDate: date('target_date', { mode: 'string' }),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('vaults_target_amount_positive', sql`${table.targetAmount} > 0`)],
);

export const vaultContributions = pgTable(
  'vault_contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vaultId: uuid('vault_id').notNull().references(() => vaults.id),
    amount: money('amount'),
    createdAt: createdAt(),
  },
  (table) => [
    check('vault_contributions_amount_positive', sql`${table.amount} > 0`),
    index('vault_contributions_vault_id_idx').on(table.vaultId),
    index('vault_contributions_created_at_idx').on(table.createdAt),
  ],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    type: varchar('type', { length: 24 }).notNull(),
    currentValue: money('current_value'),
    note: varchar('note', { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('assets_current_value_positive', sql`${table.currentValue} > 0`)],
);

export const liabilities = pgTable(
  'liabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    type: varchar('type', { length: 24 }).notNull(),
    outstandingBalance: money('outstanding_balance'),
    note: varchar('note', { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('liabilities_outstanding_balance_positive', sql`${table.outstandingBalance} > 0`)],
);

export const subscriptionReviews = pgTable(
  'subscription_reviews',
  {
    merchantKey: varchar('merchant_key', { length: 200 }).primaryKey(),
    status: varchar('status', { length: 16 }).notNull(),
    cadence: varchar('cadence', { length: 16 }).notNull(),
    representativeAmount: money('representative_amount'),
    supportingTransactionIds: jsonb('supporting_transaction_ids').$type<string[]>().notNull(),
    nextExpectedAt: timestamp('next_expected_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('subscription_reviews_amount_positive', sql`${table.representativeAmount} > 0`),
    check('subscription_reviews_status_valid', sql`${table.status} in ('confirmed', 'dismissed')`),
    check('subscription_reviews_cadence_valid', sql`${table.cadence} in ('weekly', 'monthly')`),
  ],
);

export const moneyLent = pgTable(
  'money_lent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personName: text('person_name').notNull(),
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('money_lent_amount_positive', sql`${table.amount} > 0`),
    index('money_lent_created_at_idx').on(table.createdAt),
  ],
);

export const moneyBorrowed = pgTable(
  'money_borrowed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personName: text('person_name').notNull(),
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('money_borrowed_amount_positive', sql`${table.amount} > 0`),
    index('money_borrowed_created_at_idx').on(table.createdAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type PersonRow = typeof moneyLent.$inferSelect;
