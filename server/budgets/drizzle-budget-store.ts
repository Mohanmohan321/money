import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import type {
  CreateIncomeInput,
  IncomeCategory,
  IncomeRecord,
  MonthlyBudget,
  UpdateIncomeInput,
  UpsertBudgetInput,
} from '../../shared/contracts';
import type { AppDatabase } from '../db/client';
import { income, monthlyBudgets } from '../db/schema';
import type { BudgetStore, ListFilters } from './store';

function savedBudgetResult(row: typeof monthlyBudgets.$inferSelect): MonthlyBudget {
  return {
    month: row.month,
    salary: String(row.salary),
    spendingLimit: String(row.spendingLimit),
    savingsTarget: String(row.savingsTarget),
    source: 'saved',
    updatedAt: row.updatedAt.toISOString(),
  };
}

function suggestedBudgetResult(
  month: string,
  row?: typeof monthlyBudgets.$inferSelect,
): MonthlyBudget {
  return {
    month,
    salary: row ? String(row.salary) : '0.00',
    spendingLimit: row ? String(row.spendingLimit) : '0.00',
    savingsTarget: row ? String(row.savingsTarget) : '0.00',
    source: 'suggested',
  };
}

function incomeResult(row: typeof income.$inferSelect): IncomeRecord {
  return {
    id: row.id,
    source: row.source,
    category: row.category as IncomeCategory,
    amount: String(row.amount),
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleBudgetStore implements BudgetStore {
  constructor(private readonly database: AppDatabase) {}

  async getBudget(month: string): Promise<MonthlyBudget> {
    const [saved] = await this.database
      .select()
      .from(monthlyBudgets)
      .where(eq(monthlyBudgets.month, month))
      .limit(1);
    if (saved) return savedBudgetResult(saved);

    const [prior] = await this.database
      .select()
      .from(monthlyBudgets)
      .where(lt(monthlyBudgets.month, month))
      .orderBy(desc(monthlyBudgets.month))
      .limit(1);
    return suggestedBudgetResult(month, prior);
  }

  async upsertBudget(month: string, input: UpsertBudgetInput): Promise<MonthlyBudget> {
    const [row] = await this.database
      .insert(monthlyBudgets)
      .values({ month, ...input })
      .onConflictDoUpdate({
        target: monthlyBudgets.month,
        set: { ...input, updatedAt: sql`now()` },
      })
      .returning();
    return savedBudgetResult(row);
  }

  async createIncome(input: CreateIncomeInput): Promise<IncomeRecord> {
    const [row] = await this.database.insert(income).values(input).returning();
    return incomeResult(row);
  }

  async listIncome(filters: ListFilters): Promise<IncomeRecord[]> {
    const rows = await this.database
      .select()
      .from(income)
      .where(and(
        filters.from ? gte(income.createdAt, filters.from) : undefined,
        filters.toExclusive ? lt(income.createdAt, filters.toExclusive) : undefined,
      ))
      .orderBy(desc(income.createdAt), desc(income.id));
    return rows.map(incomeResult);
  }

  async getIncome(id: string): Promise<IncomeRecord | undefined> {
    const [row] = await this.database.select().from(income).where(eq(income.id, id)).limit(1);
    return row ? incomeResult(row) : undefined;
  }

  async updateIncome(id: string, input: UpdateIncomeInput): Promise<IncomeRecord | undefined> {
    const { createdAt, ...values } = input;
    const [row] = await this.database
      .update(income)
      .set({
        ...values,
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      })
      .where(eq(income.id, id))
      .returning();
    return row ? incomeResult(row) : undefined;
  }

  async deleteIncome(id: string): Promise<boolean> {
    const rows = await this.database.delete(income).where(eq(income.id, id)).returning({ id: income.id });
    return rows.length > 0;
  }
}
