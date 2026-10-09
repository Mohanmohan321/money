import Decimal from 'decimal.js';
import { sql } from 'drizzle-orm';

import type {
  BudgetCalendarCategory,
  BudgetCalendarDay,
  BudgetCalendarExpense,
  BudgetCalendarFrequency,
  BudgetCalendarGroup,
  BudgetCalendarMonthCategory,
  BudgetCalendarMonthConfiguration,
  BudgetCalendarOverride,
  BudgetCalendarRule,
  BudgetCalendarSettings,
  CreateBudgetCalendarCategoryInput,
  CreateBudgetCalendarExpenseInput,
  CreateBudgetCalendarRuleInput,
  UpdateBudgetCalendarCategoryInput,
  UpdateBudgetCalendarExpenseInput,
  UpdateBudgetCalendarMonthInput,
  UpdateBudgetCalendarRuleInput,
  UpdateBudgetCalendarSettingsInput,
  UpsertBudgetCalendarOverrideInput,
} from '../../shared/budget-calendar';
import type { AppDatabase } from '../db/client';
import { aggregateBudgetMonth, buildPlannedDays } from './calculations';
import type { BudgetCalendarStore } from './store';

type TimestampValue = Date | string;

interface SettingsRow {
  weekStart: number;
  weeklyFoodTarget: string;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface CategoryRow {
  id: string;
  seedKey: string | null;
  name: string;
  group: string;
  monthlyAmount: string;
  includedInOverallBudget: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface MonthRow {
  month: string;
  overallLimit: string;
  configurationSnapshot: BudgetCalendarMonthCategory[];
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface RuleRow {
  id: string;
  categoryId: string;
  frequency: string;
  amount: string;
  weekdays: number[];
  dayOfMonth: number | null;
  activeFrom: string | null;
  activeTo: string | null;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface OverrideRow {
  date: string;
  plannedAmount: string;
  note: string | null;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

interface ExpenseRow {
  id: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  description: string | null;
  notes: string | null;
  idempotencyKey: string;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
  created?: boolean;
}

function iso(value: TimestampValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rows<T>(result: { rows: unknown[] }): T[] {
  return result.rows as T[];
}

function asSettings(row: SettingsRow): BudgetCalendarSettings {
  return {
    weekStart: Number(row.weekStart),
    weeklyFoodTarget: String(row.weeklyFoodTarget),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function asCategory(row: CategoryRow): BudgetCalendarCategory {
  return {
    id: row.id,
    ...(row.seedKey ? { seedKey: row.seedKey } : {}),
    name: row.name,
    group: row.group as BudgetCalendarGroup,
    monthlyAmount: String(row.monthlyAmount),
    includedInOverallBudget: row.includedInOverallBudget,
    active: row.active,
    sortOrder: Number(row.sortOrder),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function asMonth(row: MonthRow): BudgetCalendarMonthConfiguration {
  return {
    month: row.month,
    overallLimit: String(row.overallLimit),
    categories: row.configurationSnapshot,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function asRule(row: RuleRow): BudgetCalendarRule {
  return {
    id: row.id,
    categoryId: row.categoryId,
    frequency: row.frequency as BudgetCalendarFrequency,
    amount: String(row.amount),
    weekdays: row.weekdays.map(Number),
    ...(row.dayOfMonth === null ? {} : { dayOfMonth: Number(row.dayOfMonth) }),
    ...(row.activeFrom ? { activeFrom: row.activeFrom } : {}),
    ...(row.activeTo ? { activeTo: row.activeTo } : {}),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function asOverride(row: OverrideRow): BudgetCalendarOverride {
  return {
    date: row.date,
    plannedAmount: String(row.plannedAmount),
    ...(row.note ? { note: row.note } : {}),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function asExpense(row: ExpenseRow): BudgetCalendarExpense {
  return {
    id: row.id,
    expenseDate: row.expenseDate,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    amount: String(row.amount),
    ...(row.description ? { description: row.description } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    idempotencyKey: row.idempotencyKey,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export class DrizzleBudgetCalendarStore implements BudgetCalendarStore {
  constructor(private readonly database: AppDatabase) {}

  async getSettings(): Promise<BudgetCalendarSettings> {
    const result = await this.database.execute(sql<SettingsRow>`
      SELECT week_start AS "weekStart", weekly_food_target AS "weeklyFoodTarget",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM budget_calendar_settings
      ORDER BY created_at
      LIMIT 1
    `);
    const row = rows<SettingsRow>(result)[0];
    if (!row) throw new Error('Budget Calendar settings are not initialized');
    return asSettings(row);
  }

  async updateSettings(input: UpdateBudgetCalendarSettingsInput): Promise<BudgetCalendarSettings> {
    const result = await this.database.execute(sql<SettingsRow>`
      UPDATE budget_calendar_settings
      SET week_start = ${input.weekStart}, weekly_food_target = ${input.weeklyFoodTarget},
        updated_at = now()
      WHERE id = '00000000-0000-4000-8000-000000000003'::uuid
      RETURNING week_start AS "weekStart", weekly_food_target AS "weeklyFoodTarget",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const row = rows<SettingsRow>(result)[0];
    if (!row) throw new Error('Budget Calendar settings are not initialized');
    return asSettings(row);
  }

  async listCategories(options?: { includeArchived?: boolean }): Promise<BudgetCalendarCategory[]> {
    const result = await this.database.execute(sql<CategoryRow>`
      SELECT id, seed_key AS "seedKey", name, group_name AS "group",
        monthly_amount AS "monthlyAmount",
        included_in_overall_budget AS "includedInOverallBudget", active,
        sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM budget_calendar_categories
      ${options?.includeArchived ? sql.empty() : sql`WHERE active = true`}
      ORDER BY sort_order, name, id
    `);
    return rows<CategoryRow>(result).map(asCategory);
  }

  async createCategory(input: CreateBudgetCalendarCategoryInput): Promise<BudgetCalendarCategory> {
    const result = await this.database.execute(sql<CategoryRow>`
      INSERT INTO budget_calendar_categories
        (name, group_name, monthly_amount, included_in_overall_budget, sort_order)
      VALUES (${input.name}, ${input.group}, ${input.monthlyAmount},
        ${input.includedInOverallBudget}, ${input.sortOrder ?? 0})
      RETURNING id, seed_key AS "seedKey", name, group_name AS "group",
        monthly_amount AS "monthlyAmount",
        included_in_overall_budget AS "includedInOverallBudget", active,
        sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return asCategory(rows<CategoryRow>(result)[0]);
  }

  async updateCategory(
    id: string,
    input: UpdateBudgetCalendarCategoryInput,
  ): Promise<BudgetCalendarCategory | undefined> {
    const result = await this.database.execute(sql<CategoryRow>`
      UPDATE budget_calendar_categories
      SET name = ${input.name}, group_name = ${input.group},
        monthly_amount = ${input.monthlyAmount},
        included_in_overall_budget = ${input.includedInOverallBudget},
        sort_order = ${input.sortOrder ?? 0}, active = ${input.active ?? true}, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, seed_key AS "seedKey", name, group_name AS "group",
        monthly_amount AS "monthlyAmount",
        included_in_overall_budget AS "includedInOverallBudget", active,
        sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const row = rows<CategoryRow>(result)[0];
    return row ? asCategory(row) : undefined;
  }

  async archiveCategory(id: string): Promise<'archived' | 'deleted' | 'missing'> {
    const result = await this.database.execute(sql<{ outcome: 'archived' | 'deleted' }>`
      WITH target AS (
        SELECT id FROM budget_calendar_categories WHERE id = ${id}::uuid
      ), referenced AS (
        SELECT category_id FROM budget_calendar_expenses WHERE category_id = ${id}::uuid
        UNION ALL
        SELECT category_id FROM budget_calendar_rules WHERE category_id = ${id}::uuid
      ), archived AS (
        UPDATE budget_calendar_categories SET active = false, updated_at = now()
        WHERE id IN (SELECT id FROM target) AND EXISTS (SELECT 1 FROM referenced)
        RETURNING id
      ), deleted AS (
        DELETE FROM budget_calendar_categories
        WHERE id IN (SELECT id FROM target) AND NOT EXISTS (SELECT 1 FROM referenced)
        RETURNING id
      )
      SELECT 'archived'::text AS outcome FROM archived
      UNION ALL
      SELECT 'deleted'::text AS outcome FROM deleted
    `);
    return rows<{ outcome: 'archived' | 'deleted' }>(result)[0]?.outcome ?? 'missing';
  }

  async getMonth(month: string): Promise<BudgetCalendarMonthConfiguration> {
    const selected = await this.database.execute(sql<MonthRow>`
      SELECT month, overall_limit AS "overallLimit",
        configuration_snapshot AS "configurationSnapshot",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM budget_calendar_months WHERE month = ${month} LIMIT 1
    `);
    const selectedRow = rows<MonthRow>(selected)[0];
    if (selectedRow) return asMonth(selectedRow);

    const categories = await this.listCategories();
    const snapshot: BudgetCalendarMonthCategory[] = categories.map((item) => ({
      categoryId: item.id,
      name: item.name,
      group: item.group,
      monthlyAmount: item.monthlyAmount,
      includedInOverallBudget: item.includedInOverallBudget,
      sortOrder: item.sortOrder,
    }));
    const overallLimit = snapshot.reduce(
      (total, item) => item.includedInOverallBudget ? total.plus(item.monthlyAmount) : total,
      new Decimal(0),
    ).toFixed(2);
    const inserted = await this.database.execute(sql<MonthRow>`
      INSERT INTO budget_calendar_months (month, overall_limit, configuration_snapshot)
      VALUES (${month}, ${overallLimit}, ${JSON.stringify(snapshot)}::jsonb)
      ON CONFLICT (month) DO NOTHING
      RETURNING month, overall_limit AS "overallLimit",
        configuration_snapshot AS "configurationSnapshot",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const insertedRow = rows<MonthRow>(inserted)[0];
    if (insertedRow) return asMonth(insertedRow);
    return this.getMonth(month);
  }

  async updateMonth(
    month: string,
    input: UpdateBudgetCalendarMonthInput,
  ): Promise<BudgetCalendarMonthConfiguration> {
    const result = await this.database.execute(sql<MonthRow>`
      INSERT INTO budget_calendar_months (month, overall_limit, configuration_snapshot)
      VALUES (${month}, ${input.overallLimit}, ${JSON.stringify(input.categories)}::jsonb)
      ON CONFLICT (month) DO UPDATE SET overall_limit = excluded.overall_limit,
        configuration_snapshot = excluded.configuration_snapshot, updated_at = now()
      RETURNING month, overall_limit AS "overallLimit",
        configuration_snapshot AS "configurationSnapshot",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return asMonth(rows<MonthRow>(result)[0]);
  }

  async listRules(): Promise<BudgetCalendarRule[]> {
    const result = await this.database.execute(sql<RuleRow>`
      SELECT id, category_id AS "categoryId", frequency, amount, weekdays,
        day_of_month AS "dayOfMonth", active_from AS "activeFrom", active_to AS "activeTo",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM budget_calendar_rules ORDER BY created_at, id
    `);
    return rows<RuleRow>(result).map(asRule);
  }

  async createRule(input: CreateBudgetCalendarRuleInput): Promise<BudgetCalendarRule> {
    const result = await this.database.execute(sql<RuleRow>`
      INSERT INTO budget_calendar_rules
        (category_id, frequency, amount, weekdays, day_of_month, active_from, active_to)
      SELECT ${input.categoryId}::uuid, ${input.frequency}, ${input.amount},
        ${JSON.stringify(input.weekdays)}::jsonb, ${input.dayOfMonth ?? null},
        ${input.activeFrom ?? null}::date, ${input.activeTo ?? null}::date
      FROM budget_calendar_categories WHERE id = ${input.categoryId}::uuid AND active = true
      RETURNING id, category_id AS "categoryId", frequency, amount, weekdays,
        day_of_month AS "dayOfMonth", active_from AS "activeFrom", active_to AS "activeTo",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const row = rows<RuleRow>(result)[0];
    if (!row) throw new Error('Budget Calendar category is missing or inactive');
    return asRule(row);
  }

  async updateRule(
    id: string,
    input: UpdateBudgetCalendarRuleInput,
  ): Promise<BudgetCalendarRule | undefined> {
    const result = await this.database.execute(sql<RuleRow>`
      UPDATE budget_calendar_rules SET category_id = ${input.categoryId}::uuid,
        frequency = ${input.frequency}, amount = ${input.amount},
        weekdays = ${JSON.stringify(input.weekdays)}::jsonb,
        day_of_month = ${input.dayOfMonth ?? null}, active_from = ${input.activeFrom ?? null}::date,
        active_to = ${input.activeTo ?? null}::date, updated_at = now()
      WHERE id = ${id}::uuid AND EXISTS (
        SELECT 1 FROM budget_calendar_categories
        WHERE id = ${input.categoryId}::uuid AND active = true
      )
      RETURNING id, category_id AS "categoryId", frequency, amount, weekdays,
        day_of_month AS "dayOfMonth", active_from AS "activeFrom", active_to AS "activeTo",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const row = rows<RuleRow>(result)[0];
    return row ? asRule(row) : undefined;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await this.database.execute(sql<{ id: string }>`
      DELETE FROM budget_calendar_rules WHERE id = ${id}::uuid RETURNING id
    `);
    return result.rows.length > 0;
  }

  async upsertOverride(
    date: string,
    input: UpsertBudgetCalendarOverrideInput,
  ): Promise<BudgetCalendarOverride> {
    const result = await this.database.execute(sql<OverrideRow>`
      INSERT INTO budget_calendar_overrides (date, planned_amount, note)
      VALUES (${date}::date, ${input.plannedAmount}, ${input.note ?? null})
      ON CONFLICT (date) DO UPDATE SET planned_amount = excluded.planned_amount,
        note = excluded.note, updated_at = now()
      RETURNING date, planned_amount AS "plannedAmount", note,
        created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return asOverride(rows<OverrideRow>(result)[0]);
  }

  async deleteOverride(date: string): Promise<boolean> {
    const result = await this.database.execute(sql<{ date: string }>`
      DELETE FROM budget_calendar_overrides WHERE date = ${date}::date RETURNING date
    `);
    return result.rows.length > 0;
  }

  async getDay(date: string, today: string): Promise<BudgetCalendarDay> {
    const month = date.slice(0, 7);
    const [configuration, rules, overrideResult, expenseResult, dayRecordResult] = await Promise.all([
      this.getMonth(month),
      this.listRules(),
      this.database.execute(sql<OverrideRow>`
        SELECT date, planned_amount AS "plannedAmount", note,
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM budget_calendar_overrides WHERE date = ${date}::date
      `),
      this.database.execute(sql<ExpenseRow>`
        SELECT expense.id, expense.expense_date AS "expenseDate",
          expense.category_id AS "categoryId", category.name AS "categoryName",
          expense.amount, expense.description, expense.notes,
          expense.idempotency_key AS "idempotencyKey",
          expense.created_at AS "createdAt", expense.updated_at AS "updatedAt"
        FROM budget_calendar_expenses expense
        INNER JOIN budget_calendar_categories category ON category.id = expense.category_id
        WHERE expense.expense_date = ${date}::date
        ORDER BY expense.created_at, expense.id
      `),
      this.database.execute(sql<{ date: string }>`
        SELECT date FROM budget_calendar_day_records
        WHERE date = ${date}::date AND recorded_zero = true
      `),
    ]);
    const overrides = rows<OverrideRow>(overrideResult).map(asOverride);
    const expenses = rows<ExpenseRow>(expenseResult).map(asExpense);
    const plannedDays = buildPlannedDays({ month, rules, overrides });
    const result = aggregateBudgetMonth({
      month,
      today,
      overallLimit: configuration.overallLimit,
      plannedDays,
      expenses,
      recordedZeroDates: new Set(rows<{ date: string }>(dayRecordResult).map((row) => row.date)),
    });
    const selected = result.days.find((day) => day.date === date);
    if (!selected) throw new Error('Budget Calendar date is outside its month');
    return selected;
  }

  async createExpense(input: CreateBudgetCalendarExpenseInput): Promise<
    | { outcome: 'created' | 'replayed'; expense: BudgetCalendarExpense }
    | { outcome: 'invalid_category' }
  > {
    const result = await this.database.execute(sql<ExpenseRow>`
      WITH selected_category AS (
        SELECT id, name FROM budget_calendar_categories
        WHERE id = ${input.categoryId}::uuid AND active = true
      ), existing AS (
        SELECT expense.*, category.name AS category_name
        FROM budget_calendar_expenses expense
        INNER JOIN budget_calendar_categories category ON category.id = expense.category_id
        WHERE expense.idempotency_key = ${input.idempotencyKey}::uuid
      ), inserted AS (
        INSERT INTO budget_calendar_expenses
          (expense_date, category_id, amount, description, notes, idempotency_key)
        SELECT ${input.expenseDate}::date, selected_category.id, ${input.amount},
          ${input.description ?? null}, ${input.notes ?? null}, ${input.idempotencyKey}::uuid
        FROM selected_category
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING *
      ), cleared AS (
        DELETE FROM budget_calendar_day_records
        WHERE date = ${input.expenseDate}::date AND EXISTS (SELECT 1 FROM inserted)
      )
      SELECT inserted.id, inserted.expense_date AS "expenseDate",
        inserted.category_id AS "categoryId", selected_category.name AS "categoryName",
        inserted.amount, inserted.description, inserted.notes,
        inserted.idempotency_key AS "idempotencyKey",
        inserted.created_at AS "createdAt", inserted.updated_at AS "updatedAt", true AS created
      FROM inserted INNER JOIN selected_category ON selected_category.id = inserted.category_id
      UNION ALL
      SELECT existing.id, existing.expense_date AS "expenseDate",
        existing.category_id AS "categoryId", existing.category_name AS "categoryName",
        existing.amount, existing.description, existing.notes,
        existing.idempotency_key AS "idempotencyKey",
        existing.created_at AS "createdAt", existing.updated_at AS "updatedAt", false AS created
      FROM existing
      LIMIT 1
    `);
    const row = rows<ExpenseRow>(result)[0];
    if (!row) return { outcome: 'invalid_category' };
    return { outcome: row.created ? 'created' : 'replayed', expense: asExpense(row) };
  }

  async updateExpense(
    id: string,
    input: UpdateBudgetCalendarExpenseInput,
  ): Promise<BudgetCalendarExpense | 'invalid_category' | undefined> {
    const result = await this.database.execute(sql<ExpenseRow>`
      UPDATE budget_calendar_expenses expense
      SET expense_date = ${input.expenseDate}::date, category_id = category.id,
        amount = ${input.amount}, description = ${input.description ?? null},
        notes = ${input.notes ?? null}, updated_at = now()
      FROM budget_calendar_categories category
      WHERE expense.id = ${id}::uuid AND category.id = ${input.categoryId}::uuid
        AND category.active = true
      RETURNING expense.id, expense.expense_date AS "expenseDate",
        expense.category_id AS "categoryId", category.name AS "categoryName",
        expense.amount, expense.description, expense.notes,
        expense.idempotency_key AS "idempotencyKey",
        expense.created_at AS "createdAt", expense.updated_at AS "updatedAt"
    `);
    const row = rows<ExpenseRow>(result)[0];
    if (row) return asExpense(row);
    const categoryResult = await this.database.execute(sql<{ active: boolean }>`
      SELECT active FROM budget_calendar_categories
      WHERE id = ${input.categoryId}::uuid AND active = true
    `);
    return categoryResult.rows.length === 0 ? 'invalid_category' : undefined;
  }

  async deleteExpense(id: string): Promise<boolean> {
    const result = await this.database.execute(sql<{ id: string }>`
      DELETE FROM budget_calendar_expenses WHERE id = ${id}::uuid RETURNING id
    `);
    return result.rows.length > 0;
  }

  async setDayRecordState(
    date: string,
    recordedZero: boolean,
  ): Promise<'updated' | 'expenses_exist'> {
    if (!recordedZero) {
      await this.database.execute(sql`
        DELETE FROM budget_calendar_day_records WHERE date = ${date}::date
      `);
      return 'updated';
    }
    const result = await this.database.execute(sql<{ outcome: 'updated' | 'expenses_exist' }>`
      WITH expenses AS (
        SELECT 1 FROM budget_calendar_expenses WHERE expense_date = ${date}::date LIMIT 1
      ), written AS (
        INSERT INTO budget_calendar_day_records (date, recorded_zero)
        SELECT ${date}::date, true WHERE NOT EXISTS (SELECT 1 FROM expenses)
        ON CONFLICT (date) DO UPDATE SET recorded_zero = true, updated_at = now()
        RETURNING date
      )
      SELECT CASE WHEN EXISTS (SELECT 1 FROM expenses)
        THEN 'expenses_exist'::text ELSE 'updated'::text END AS outcome
    `);
    return rows<{ outcome: 'updated' | 'expenses_exist' }>(result)[0]?.outcome ?? 'updated';
  }
}
