import { sql } from 'drizzle-orm';
import {
  check,
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

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('transactions_amount_positive', sql`${table.amount} > 0`),
    index('transactions_created_at_idx').on(table.createdAt),
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
