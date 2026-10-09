import { and, eq, gte, isNull, lt, or } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DEFAULT_BUDGET_SETTINGS, buildBudgetMonth, type BudgetExpense, type BudgetSettings } from '../../shared/budget-workspace';
import { categorizeTransaction } from '../../shared/budgeting';
import type { AppDatabase } from '../db/client';
import { budgetDateOverrides, budgetDayRecords, budgetSettings, transactions } from '../db/schema';
import { monthRange } from '../lib/time';
import type { BudgetWorkspaceStore, CreateBudgetExpenseInput, UpdateBudgetExpenseInput } from './store';

function nextMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  const next = value === 12 ? [year + 1, 1] : [year, value + 1];
  return `${next[0]}-${String(next[1]).padStart(2, '0')}`;
}

export function transactionLocalExpenseDate(row: { expenseDate: string | null; createdAt: Date }, timezone: string) {
  return row.expenseDate ?? DateTime.fromJSDate(row.createdAt, { zone: timezone }).toFormat('yyyy-MM-dd');
}

function expenseResult(row: typeof transactions.$inferSelect, timezone: string): BudgetExpense {
  return {
    id: row.id, amount: row.amount, description: row.description,
    budgetCategory: row.budgetCategory ?? row.category,
    expenseDate: transactionLocalExpenseDate(row, timezone),
    notes: row.notes, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleBudgetWorkspaceStore implements BudgetWorkspaceStore {
  constructor(private readonly database: AppDatabase, private readonly timezone: string) {}

  private async settings(): Promise<BudgetSettings> {
    await this.database.insert(budgetSettings).values({ id: 'default', ...DEFAULT_BUDGET_SETTINGS }).onConflictDoNothing();
    const [row] = await this.database.select().from(budgetSettings).where(eq(budgetSettings.id, 'default')).limit(1);
    if (!row) throw new Error('Budget settings could not be loaded');
    return { overallMonthlyLimit: row.overallMonthlyLimit, weeklyFoodTarget: row.weeklyFoodTarget, weekStart: 1 as const, categories: row.categories };
  }

  async getWorkspace(month: string, today: string) {
    const range = monthRange(month, this.timezone);
    const [settings, overrideRows, zeroRows, expenseRows] = await Promise.all([
      this.settings(),
      this.database.select().from(budgetDateOverrides).where(and(gte(budgetDateOverrides.date, `${month}-01`), lt(budgetDateOverrides.date, `${nextMonth(month)}-01`))),
      this.database.select().from(budgetDayRecords).where(and(gte(budgetDayRecords.date, `${month}-01`), lt(budgetDayRecords.date, `${nextMonth(month)}-01`))),
      this.database.select().from(transactions).where(or(
        and(gte(transactions.expenseDate, `${month}-01`), lt(transactions.expenseDate, `${nextMonth(month)}-01`)),
        and(isNull(transactions.expenseDate), gte(transactions.createdAt, range.from), lt(transactions.createdAt, range.toExclusive)),
      )),
    ]);
    return buildBudgetMonth({
      month, today, settings,
      overrides: overrideRows.map((row) => ({ date: row.date, plannedAmount: row.plannedAmount, note: row.note })),
      explicitZeroDates: zeroRows.filter((row) => row.recordedZero).map((row) => row.date),
      expenses: expenseRows.map((row) => expenseResult(row, this.timezone)),
    });
  }

  async saveSettings(value: BudgetSettings) {
    const [row] = await this.database.insert(budgetSettings).values({ id: 'default', ...value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: budgetSettings.id, set: { ...value, updatedAt: new Date() } }).returning();
    return { overallMonthlyLimit: row.overallMonthlyLimit, weeklyFoodTarget: row.weeklyFoodTarget, weekStart: 1 as const, categories: row.categories };
  }

  async saveOverride(value: { date: string; plannedAmount: string; note: string | null }) {
    const [row] = await this.database.insert(budgetDateOverrides).values(value).onConflictDoUpdate({ target: budgetDateOverrides.date, set: { plannedAmount: value.plannedAmount, note: value.note, updatedAt: new Date() } }).returning();
    return { date: row.date, plannedAmount: row.plannedAmount, note: row.note };
  }
  async deleteOverride(date: string) { return (await this.database.delete(budgetDateOverrides).where(eq(budgetDateOverrides.date, date)).returning()).length > 0; }
  async setRecordedZero(date: string, recorded: boolean) {
    if (!recorded) { await this.database.delete(budgetDayRecords).where(eq(budgetDayRecords.date, date)); return false; }
    await this.database.insert(budgetDayRecords).values({ date, recordedZero: true }).onConflictDoUpdate({ target: budgetDayRecords.date, set: { recordedZero: true, updatedAt: new Date() } });
    return true;
  }

  async createExpense(input: CreateBudgetExpenseInput) {
    const [row] = await this.database.insert(transactions).values({
      ...input, category: categorizeTransaction(input.description),
    }).onConflictDoNothing({ target: transactions.idempotencyKey }).returning();
    const result = row ?? (await this.database.select().from(transactions).where(eq(transactions.idempotencyKey, input.idempotencyKey)).limit(1))[0];
    if (!result) throw new Error('Expense could not be created');
    await this.database.delete(budgetDayRecords).where(eq(budgetDayRecords.date, input.expenseDate));
    return expenseResult(result, this.timezone);
  }
  async updateExpense(id: string, input: UpdateBudgetExpenseInput) {
    const [row] = await this.database.update(transactions).set({ ...input, category: categorizeTransaction(input.description), updatedAt: new Date() }).where(eq(transactions.id, id)).returning();
    if (row) await this.database.delete(budgetDayRecords).where(eq(budgetDayRecords.date, input.expenseDate));
    return row ? expenseResult(row, this.timezone) : undefined;
  }
  async deleteExpense(id: string) { return (await this.database.delete(transactions).where(eq(transactions.id, id)).returning({ id: transactions.id })).length > 0; }
}
