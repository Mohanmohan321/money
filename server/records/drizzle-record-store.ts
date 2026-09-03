import { and, desc, eq, gte, lt } from 'drizzle-orm';

import type {
  CreatePersonRecordInput,
  CreateTransactionInput,
  PersonRecord,
  SpendingCategory,
  TransactionRecord,
} from '../../shared/contracts';
import { categorizeTransaction } from '../../shared/budgeting';
import type { AppDatabase } from '../db/client';
import { moneyBorrowed, moneyLent, transactions } from '../db/schema';
import type { ListFilters, RecordStore } from './store';

function transactionResult(row: typeof transactions.$inferSelect): TransactionRecord {
  return { ...row, category: row.category as SpendingCategory, createdAt: row.createdAt.toISOString() };
}

function personResult(row: typeof moneyLent.$inferSelect): PersonRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export class DrizzleRecordStore implements RecordStore {
  constructor(private readonly database: AppDatabase) {}

  async createTransaction(input: CreateTransactionInput) {
    const [row] = await this.database.insert(transactions).values({
      ...input,
      category: input.category ?? categorizeTransaction(input.description),
    }).returning();
    return transactionResult(row);
  }

  async listTransactions(filters: ListFilters) {
    const rows = await this.database
      .select()
      .from(transactions)
      .where(and(
        filters.from ? gte(transactions.createdAt, filters.from) : undefined,
        filters.toExclusive ? lt(transactions.createdAt, filters.toExclusive) : undefined,
      ))
      .orderBy(desc(transactions.createdAt), desc(transactions.id));
    return rows.map(transactionResult);
  }

  async getTransaction(id: string) {
    const [row] = await this.database.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    return row ? transactionResult(row) : undefined;
  }

  async deleteTransaction(id: string) {
    const rows = await this.database.delete(transactions).where(eq(transactions.id, id)).returning({ id: transactions.id });
    return rows.length > 0;
  }

  async createLent(input: CreatePersonRecordInput) {
    const [row] = await this.database.insert(moneyLent).values(input).returning();
    return personResult(row);
  }

  async listLent(filters: ListFilters) {
    const rows = await this.database
      .select()
      .from(moneyLent)
      .where(and(
        filters.from ? gte(moneyLent.createdAt, filters.from) : undefined,
        filters.toExclusive ? lt(moneyLent.createdAt, filters.toExclusive) : undefined,
      ))
      .orderBy(desc(moneyLent.createdAt), desc(moneyLent.id));
    return rows.map(personResult);
  }

  async getLent(id: string) {
    const [row] = await this.database.select().from(moneyLent).where(eq(moneyLent.id, id)).limit(1);
    return row ? personResult(row) : undefined;
  }

  async deleteLent(id: string) {
    const rows = await this.database.delete(moneyLent).where(eq(moneyLent.id, id)).returning({ id: moneyLent.id });
    return rows.length > 0;
  }

  async createBorrowed(input: CreatePersonRecordInput) {
    const [row] = await this.database.insert(moneyBorrowed).values(input).returning();
    return personResult(row);
  }

  async listBorrowed(filters: ListFilters) {
    const rows = await this.database
      .select()
      .from(moneyBorrowed)
      .where(and(
        filters.from ? gte(moneyBorrowed.createdAt, filters.from) : undefined,
        filters.toExclusive ? lt(moneyBorrowed.createdAt, filters.toExclusive) : undefined,
      ))
      .orderBy(desc(moneyBorrowed.createdAt), desc(moneyBorrowed.id));
    return rows.map(personResult);
  }

  async getBorrowed(id: string) {
    const [row] = await this.database.select().from(moneyBorrowed).where(eq(moneyBorrowed.id, id)).limit(1);
    return row ? personResult(row) : undefined;
  }

  async deleteBorrowed(id: string) {
    const rows = await this.database.delete(moneyBorrowed).where(eq(moneyBorrowed.id, id)).returning({ id: moneyBorrowed.id });
    return rows.length > 0;
  }
}
