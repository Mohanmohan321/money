import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

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
    category: varchar('category', { length: 24 }).notNull().default('other'),
    amount: money('amount'),
    createdAt: createdAt(),
  },
  (table) => [
    check('transactions_amount_positive', sql`${table.amount} > 0`),
    index('transactions_created_at_idx').on(table.createdAt),
  ],
);

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
