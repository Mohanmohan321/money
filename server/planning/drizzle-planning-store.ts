import Decimal from 'decimal.js';
import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { calculateBudgetSummary } from '../../shared/budgeting';
import type {
  AnnualReportData,
  CalendarActivity,
  CalendarDay,
  CategorySpend,
  IncomeCategory,
  MonthBudgetBreakdown,
  MonthlyBudget,
  RecentActivity,
  SpendingCategory,
} from '../../shared/contracts';
import type { BudgetStore } from '../budgets/store';
import type { AppDatabase } from '../db/client';
import { normalizeMerchant } from '../subscriptions/detector';
import type {
  AnnualPlanningQuery,
  BreakdownPlanningQuery,
  MonthlyPlanningQuery,
  PlanningStore,
} from './store';

export const spendingCategories: readonly SpendingCategory[] = [
  'food', 'travel', 'shopping', 'coffee', 'entertainment', 'health', 'bills', 'other',
];

export interface MonthCalculationInput {
  month: string;
  salary: string;
  additionalIncome: string;
  spending: string;
  savings: string;
  spendingLimit: string;
}

function significantDigits(value: string): number {
  return Math.max(1, value.replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '').length);
}

function decimalFor(values: string[], extraPrecision = 8) {
  const widest = Math.max(1, ...values.map(significantDigits));
  return Decimal.clone({ precision: Math.max(24, widest + extraPrecision) });
}

function normalizeMoney(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '0' : String(value);
  const MoneyDecimal = decimalFor([text], 4);
  return new MoneyDecimal(text).toFixed(2);
}

function sumMoney(values: string[]): string {
  if (values.length === 0) return '0.00';
  const MoneyDecimal = decimalFor(values, Math.ceil(Math.log10(values.length + 1)) + 6);
  return values.reduce((total, value) => total.plus(value), new MoneyDecimal(0)).toFixed(2);
}

export function percentageOf(amount: string, total: string): string {
  const MoneyDecimal = decimalFor([amount, total], 16);
  const denominator = new MoneyDecimal(total);
  if (denominator.isZero()) return '0.00';
  return new MoneyDecimal(amount).div(denominator).mul(100).toFixed(2);
}

export function fillBudgetDays(
  from: Date,
  toExclusive: Date,
  timezone: string,
  points: CalendarDay[],
): CalendarDay[] {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const result: CalendarDay[] = [];
  let cursor = DateTime.fromJSDate(from, { zone: timezone }).startOf('day');
  const end = DateTime.fromJSDate(toExclusive, { zone: timezone }).startOf('day');

  while (cursor < end) {
    const date = cursor.toFormat('yyyy-MM-dd');
    result.push(byDate.get(date) ?? {
      date,
      income: '0.00',
      spending: '0.00',
      savings: '0.00',
      activity: [],
      vaultContributionCount: 0,
      subscriptionPaymentCount: 0,
    });
    cursor = cursor.plus({ days: 1 });
  }
  return result;
}

export function fillBudgetMonths(
  year: string,
  values: MonthCalculationInput[],
): MonthBudgetBreakdown[] {
  const byMonth = new Map(values.map((value) => [value.month, value]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const input = byMonth.get(month) ?? {
      month,
      salary: '0.00',
      additionalIncome: '0.00',
      spending: '0.00',
      savings: '0.00',
      spendingLimit: '0.00',
    };
    const summary = calculateBudgetSummary(input);
    return {
      month,
      income: summary.income,
      spending: summary.spending,
      savings: summary.savings,
      amountLeft: summary.amountLeft,
      budgetUsage: percentageOf(summary.spending, input.spendingLimit),
    };
  });
}

export function selectExtremeMonth(
  months: MonthBudgetBreakdown[],
  field: 'spending' | 'savings',
  direction: 'max' | 'min',
): string | undefined {
  if (months.length === 0) return undefined;
  return [...months].sort((left, right) => {
    const MoneyDecimal = decimalFor([left[field], right[field]], 4);
    const comparison = new MoneyDecimal(left[field]).comparedTo(right[field]);
    if (comparison !== 0) return direction === 'max' ? -comparison : comparison;
    return left.month.localeCompare(right.month);
  })[0]?.month;
}

interface TotalsRow {
  [key: string]: unknown;
  additionalIncome: string;
  spending: string;
  savings: string;
}

export interface CategoryAggregate {
  [key: string]: unknown;
  category: string;
  amount: string;
}

interface DayRow {
  [key: string]: unknown;
  date: string;
  income: string;
  spending: string;
  savings: string;
  vaultContributionCount: number;
}

interface ActivityRow {
  [key: string]: unknown;
  type: 'transaction' | 'income';
  id: string;
  description: string | null;
  source: string | null;
  category: string;
  amount: string;
  createdAt: Date | string;
  date: string;
}

interface CalendarActivityRow {
  [key: string]: unknown;
  type: 'transaction' | 'income' | 'vault-contribution';
  id: string;
  description: string | null;
  source: string | null;
  category: string | null;
  amount: string;
  createdAt: Date | string;
  date: string;
  vaultId?: string | null;
  vaultName?: string | null;
  vaultEmoji?: string | null;
}

interface MonthRow extends TotalsRow {
  month: string;
}

export interface SavedBudgetAggregate {
  [key: string]: unknown;
  month: string;
  salary: string;
  spendingLimit: string;
  savingsTarget: string;
  updatedAt: Date | string;
}

export interface IncomeSourceAggregate {
  [key: string]: unknown;
  source: string;
  amount: string;
}

export function buildAnnualReport(
  year: string,
  inputs: MonthCalculationInput[],
  categories: CategoryAggregate[],
  sources: IncomeSourceAggregate[],
): AnnualReportData {
  const months = fillBudgetMonths(year, inputs);
  const salary = sumMoney(inputs.map((month) => month.salary));
  const additionalIncome = sumMoney(inputs.map((month) => month.additionalIncome));
  const spending = sumMoney(inputs.map((month) => month.spending));
  const savings = sumMoney(inputs.map((month) => month.savings));
  const spendingLimit = sumMoney(inputs.map((month) => month.spendingLimit));
  const summary = calculateBudgetSummary({
    salary, additionalIncome, spending, savings, spendingLimit,
  });
  const incomeSourceAmounts = new Map<string, string>([['Salary', salary]]);
  for (const row of sources) {
    const source = String(row.source);
    const amount = normalizeMoney(row.amount);
    incomeSourceAmounts.set(
      source,
      sumMoney([incomeSourceAmounts.get(source) ?? '0.00', amount]),
    );
  }
  const incomeSources = [...incomeSourceAmounts].map(([source, amount]) => ({ source, amount }));
  const positiveSpending = months.filter((month) => new Decimal(month.spending).gt(0));
  const positiveSavings = months.filter((month) => new Decimal(month.savings).gt(0));

  return {
    year,
    summary,
    months,
    spendingByCategory: fillCategorySpending(categories, spending),
    incomeBySource: incomeSources.map((source) => ({
      ...source,
      percentage: percentageOf(source.amount, summary.income),
    })),
    highestSpendingMonth: selectExtremeMonth(positiveSpending, 'spending', 'max'),
    bestSavingMonth: selectExtremeMonth(positiveSavings, 'savings', 'max'),
  };
}

function asActivity(row: ActivityRow): RecentActivity {
  const base = {
    id: String(row.id),
    amount: normalizeMoney(row.amount),
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString(),
  };
  if (row.type === 'transaction') {
    return {
      ...base,
      type: 'transaction',
      description: String(row.description),
      category: row.category as SpendingCategory,
    };
  }
  return {
    ...base,
    type: 'income',
    source: String(row.source),
    category: row.category as IncomeCategory,
  };
}

function asCalendarActivity(row: CalendarActivityRow): CalendarActivity {
  if (row.type === 'vault-contribution') {
    return {
      type: 'vault-contribution',
      id: String(row.id),
      vaultId: String(row.vaultId),
      vaultName: String(row.vaultName),
      ...(row.vaultEmoji ? { vaultEmoji: String(row.vaultEmoji) } : {}),
      amount: normalizeMoney(row.amount),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    };
  }
  return asActivity(row as ActivityRow);
}

export function fillCategorySpending(
  rows: CategoryAggregate[],
  spending: string,
): CategorySpend[] {
  const values = new Map(rows.map((row) => [row.category, normalizeMoney(row.amount)]));
  return spendingCategories.map((category) => {
    const amount = values.get(category) ?? '0.00';
    return { category, amount, percentage: percentageOf(amount, spending) };
  });
}

export function countConfirmedSubscriptionPayments(
  activities: Array<{ type: string; description: string | null; date: string }>,
  confirmedKeys: ReadonlySet<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const activity of activities) {
    if (activity.type !== 'transaction' || !activity.description) continue;
    if (!confirmedKeys.has(normalizeMerchant(activity.description))) continue;
    counts.set(activity.date, (counts.get(activity.date) ?? 0) + 1);
  }
  return counts;
}

function dayPoints(
  rows: DayRow[],
  activities: CalendarActivityRow[],
  confirmedKeys: ReadonlySet<string> = new Set(),
): CalendarDay[] {
  const activityByDate = new Map<string, CalendarActivity[]>();
  for (const row of activities) {
    const date = String((row as ActivityRow & { date?: string }).date ?? '');
    const list = activityByDate.get(date) ?? [];
    list.push(asCalendarActivity(row));
    activityByDate.set(date, list);
  }
  const subscriptionCounts = countConfirmedSubscriptionPayments(activities, confirmedKeys);
  return rows.map((row) => ({
    date: String(row.date),
    income: normalizeMoney(row.income),
    spending: normalizeMoney(row.spending),
    savings: normalizeMoney(row.savings),
    activity: activityByDate.get(String(row.date)) ?? [],
    vaultContributionCount: Number(row.vaultContributionCount ?? 0),
    subscriptionPaymentCount: subscriptionCounts.get(String(row.date)) ?? 0,
  }));
}

function monthKeys(year: string): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
}

export function buildPlanningBudgets(
  year: string,
  rows: SavedBudgetAggregate[],
): MonthlyBudget[] {
  const firstMonth = `${year}-01`;
  const sorted = [...rows].sort((left, right) => left.month.localeCompare(right.month));
  let carried = sorted.filter((row) => row.month < firstMonth).at(-1);
  const savedByMonth = new Map(
    sorted.filter((row) => row.month.startsWith(`${year}-`)).map((row) => [row.month, row]),
  );

  return monthKeys(year).map((month) => {
    const saved = savedByMonth.get(month);
    if (saved) {
      carried = saved;
      return {
        month,
        salary: normalizeMoney(saved.salary),
        spendingLimit: normalizeMoney(saved.spendingLimit),
        savingsTarget: normalizeMoney(saved.savingsTarget),
        source: 'saved',
        updatedAt: saved.updatedAt instanceof Date
          ? saved.updatedAt.toISOString()
          : new Date(saved.updatedAt).toISOString(),
      };
    }
    return {
      month,
      salary: normalizeMoney(carried?.salary),
      spendingLimit: normalizeMoney(carried?.spendingLimit),
      savingsTarget: normalizeMoney(carried?.savingsTarget),
      source: 'suggested',
    };
  });
}

export class DrizzlePlanningStore implements PlanningStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly budgetStore: BudgetStore,
  ) {}

  private async loadBudgets(year: string) {
    const firstMonth = `${year}-01`;
    const lastMonth = `${year}-12`;
    const result = await this.database.execute(sql<SavedBudgetAggregate>`
      WITH applicable_budgets AS (
        (
          SELECT month, salary, spending_limit, savings_target, updated_at
          FROM monthly_budgets
          WHERE month < ${firstMonth}
          ORDER BY month DESC
          LIMIT 1
        )
        UNION ALL
        (
          SELECT month, salary, spending_limit, savings_target, updated_at
          FROM monthly_budgets
          WHERE month >= ${firstMonth} AND month <= ${lastMonth}
        )
      )
      SELECT
        month,
        salary::text AS salary,
        spending_limit::text AS "spendingLimit",
        savings_target::text AS "savingsTarget",
        updated_at AS "updatedAt"
      FROM applicable_budgets
      ORDER BY month
    `);
    return buildPlanningBudgets(
      year,
      result.rows as unknown as SavedBudgetAggregate[],
    );
  }

  private async loadYearMonths(
    year: string,
    timezone: string,
    from: Date,
    toExclusive: Date,
  ): Promise<{ inputs: MonthCalculationInput[]; months: MonthBudgetBreakdown[] }> {
    const [budgets, result] = await Promise.all([
      this.loadBudgets(year),
      this.database.execute(sql<MonthRow>`
        WITH events AS (
          SELECT 'income'::text AS type, amount, created_at FROM income
          UNION ALL
          SELECT 'spending'::text AS type, amount, created_at FROM transactions
          UNION ALL
          SELECT 'savings'::text AS type, amount, created_at FROM vault_contributions
        )
        SELECT
          to_char(date_trunc('month', created_at AT TIME ZONE ${timezone}), 'YYYY-MM') AS month,
          coalesce(sum(amount) FILTER (WHERE type = 'income'), 0)::text AS "additionalIncome",
          coalesce(sum(amount) FILTER (WHERE type = 'spending'), 0)::text AS spending,
          coalesce(sum(amount) FILTER (WHERE type = 'savings'), 0)::text AS savings
        FROM events
        WHERE created_at >= ${from.toISOString()}::timestamptz
          AND created_at < ${toExclusive.toISOString()}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `),
    ]);
    const rows = result.rows as unknown as MonthRow[];
    const totals = new Map(rows.map((row) => [String(row.month), row]));
    const inputs = budgets.map((budget) => {
      const aggregate = totals.get(budget.month);
      return {
        month: budget.month,
        salary: normalizeMoney(budget.salary),
        spendingLimit: normalizeMoney(budget.spendingLimit),
        additionalIncome: normalizeMoney(aggregate?.additionalIncome),
        spending: normalizeMoney(aggregate?.spending),
        savings: normalizeMoney(aggregate?.savings),
      };
    });
    return { inputs, months: fillBudgetMonths(year, inputs) };
  }

  async getMonthly(query: MonthlyPlanningQuery) {
    const [budget, totalsResult, categoriesResult, daysResult, activityResult, recentResult] = await Promise.all([
      this.budgetStore.getBudget(query.month),
      this.database.execute(sql<TotalsRow>`
        SELECT
          (SELECT coalesce(sum(amount), 0)::text FROM income
            WHERE created_at >= ${query.range.from.toISOString()}::timestamptz
              AND created_at < ${query.range.toExclusive.toISOString()}::timestamptz) AS "additionalIncome",
          (SELECT coalesce(sum(amount), 0)::text FROM transactions
            WHERE created_at >= ${query.range.from.toISOString()}::timestamptz
              AND created_at < ${query.range.toExclusive.toISOString()}::timestamptz) AS spending,
          (SELECT coalesce(sum(amount), 0)::text FROM vault_contributions
            WHERE created_at >= ${query.range.from.toISOString()}::timestamptz
              AND created_at < ${query.range.toExclusive.toISOString()}::timestamptz) AS savings
      `),
      this.database.execute(sql<CategoryAggregate>`
        SELECT category, sum(amount)::text AS amount
        FROM transactions
        WHERE created_at >= ${query.range.from.toISOString()}::timestamptz
          AND created_at < ${query.range.toExclusive.toISOString()}::timestamptz
        GROUP BY category
      `),
      this.database.execute(sql<DayRow>`
        WITH events AS (
          SELECT 'income'::text AS type, amount, created_at FROM income
          UNION ALL
          SELECT 'spending'::text AS type, amount, created_at FROM transactions
          UNION ALL
          SELECT 'savings'::text AS type, amount, created_at FROM vault_contributions
        )
        SELECT
          to_char(created_at AT TIME ZONE ${query.timezone}, 'YYYY-MM-DD') AS date,
          coalesce(sum(amount) FILTER (WHERE type = 'income'), 0)::text AS income,
          coalesce(sum(amount) FILTER (WHERE type = 'spending'), 0)::text AS spending,
          coalesce(sum(amount) FILTER (WHERE type = 'savings'), 0)::text AS savings,
          count(*) FILTER (WHERE type = 'savings')::int AS "vaultContributionCount"
        FROM events
        WHERE created_at >= ${query.week.from.toISOString()}::timestamptz
          AND created_at < ${query.week.toExclusive.toISOString()}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `),
      this.loadActivity(query.week.from, query.week.toExclusive, query.timezone),
      this.loadActivity(query.range.from, query.range.toExclusive, query.timezone, 5),
    ]);

    const totals = totalsResult.rows[0] as unknown as TotalsRow | undefined;
    const additionalIncome = normalizeMoney(totals?.additionalIncome);
    const spending = normalizeMoney(totals?.spending);
    const savings = normalizeMoney(totals?.savings);
    const filledDays = fillBudgetDays(
      query.week.from,
      query.week.toExclusive,
      query.timezone,
      dayPoints(daysResult.rows as unknown as DayRow[], activityResult),
    );

    return {
      month: query.month,
      budget,
      summary: calculateBudgetSummary({
        salary: budget.salary,
        additionalIncome,
        spending,
        savings,
        spendingLimit: budget.spendingLimit,
      }),
      categories: fillCategorySpending(
        categoriesResult.rows as unknown as CategoryAggregate[],
        spending,
      ),
      weekFrom: query.weekFromLabel,
      weekTo: query.weekToLabel,
      week: filledDays.map(({ vaultContributionCount: _count, subscriptionPaymentCount: _subscriptions, activity, ...day }) => ({
        ...day,
        activity: activity as RecentActivity[],
      })),
      recentActivity: recentResult.map(asActivity),
    };
  }

  async getBreakdown(query: BreakdownPlanningQuery) {
    const [{ months }, daysResult, activityResult, confirmedReviewsResult] = await Promise.all([
      this.loadYearMonths(
        query.year,
        query.timezone,
        query.yearRange.from,
        query.yearRange.toExclusive,
      ),
      this.database.execute(sql<DayRow>`
        WITH events AS (
          SELECT 'income'::text AS type, amount, created_at FROM income
          UNION ALL
          SELECT 'spending'::text AS type, amount, created_at FROM transactions
          UNION ALL
          SELECT 'savings'::text AS type, amount, created_at FROM vault_contributions
        )
        SELECT
          to_char(created_at AT TIME ZONE ${query.timezone}, 'YYYY-MM-DD') AS date,
          coalesce(sum(amount) FILTER (WHERE type = 'income'), 0)::text AS income,
          coalesce(sum(amount) FILTER (WHERE type = 'spending'), 0)::text AS spending,
          coalesce(sum(amount) FILTER (WHERE type = 'savings'), 0)::text AS savings,
          count(*) FILTER (WHERE type = 'savings')::int AS "vaultContributionCount"
        FROM events
        WHERE created_at >= ${query.monthRange.from.toISOString()}::timestamptz
          AND created_at < ${query.monthRange.toExclusive.toISOString()}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `),
      this.loadCalendarActivity(
        query.monthRange.from,
        query.monthRange.toExclusive,
        query.timezone,
      ),
      this.database.execute(sql<{ merchantKey: string }>`
        SELECT merchant_key AS "merchantKey"
        FROM subscription_reviews
        WHERE status = 'confirmed'
      `),
    ]);

    return {
      year: query.year,
      selectedMonth: query.selectedMonth,
      months,
      days: fillBudgetDays(
        query.monthRange.from,
        query.monthRange.toExclusive,
        query.timezone,
        dayPoints(
          daysResult.rows as unknown as DayRow[],
          activityResult,
          new Set(confirmedReviewsResult.rows.map((row) => String(row.merchantKey))),
        ),
      ),
    };
  }

  async getAnnual(query: AnnualPlanningQuery): Promise<AnnualReportData> {
    const [{ inputs }, categoriesResult, sourcesResult] = await Promise.all([
      this.loadYearMonths(query.year, query.timezone, query.range.from, query.range.toExclusive),
      this.database.execute(sql<CategoryAggregate>`
        SELECT category, sum(amount)::text AS amount
        FROM transactions
        WHERE created_at >= ${query.range.from.toISOString()}::timestamptz
          AND created_at < ${query.range.toExclusive.toISOString()}::timestamptz
        GROUP BY category
      `),
      this.database.execute(sql<IncomeSourceAggregate>`
        SELECT source, sum(amount)::text AS amount
        FROM income
        WHERE created_at >= ${query.range.from.toISOString()}::timestamptz
          AND created_at < ${query.range.toExclusive.toISOString()}::timestamptz
        GROUP BY source
        ORDER BY sum(amount) DESC, source
      `),
    ]);

    return buildAnnualReport(
      query.year,
      inputs,
      categoriesResult.rows as unknown as CategoryAggregate[],
      sourcesResult.rows as unknown as IncomeSourceAggregate[],
    );
  }

  private async loadActivity(
    from: Date,
    toExclusive: Date,
    timezone: string,
    limit?: number,
  ): Promise<ActivityRow[]> {
    const result = await this.database.execute(sql<ActivityRow>`
      WITH activity AS (
        SELECT 'transaction'::text AS type, id, description, NULL::text AS source,
          category, amount, created_at
        FROM transactions
        UNION ALL
        SELECT 'income'::text AS type, id, NULL::text AS description, source,
          category, amount, created_at
        FROM income
      )
      SELECT
        type, id, description, source, category, amount,
        created_at AS "createdAt",
        to_char(created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS date
      FROM activity
      WHERE created_at >= ${from.toISOString()}::timestamptz
        AND created_at < ${toExclusive.toISOString()}::timestamptz
      ORDER BY created_at DESC, id DESC
      ${limit === undefined ? sql.empty() : sql`LIMIT ${limit}`}
    `);
    return result.rows as unknown as ActivityRow[];
  }

  private async loadCalendarActivity(
    from: Date,
    toExclusive: Date,
    timezone: string,
  ): Promise<CalendarActivityRow[]> {
    const result = await this.database.execute(sql<CalendarActivityRow>`
      WITH activity AS (
        SELECT 'transaction'::text AS type, id, description, NULL::text AS source,
          category, amount, created_at, NULL::uuid AS vault_id,
          NULL::text AS vault_name, NULL::text AS vault_emoji
        FROM transactions
        UNION ALL
        SELECT 'income'::text AS type, id, NULL::text AS description, source,
          category, amount, created_at, NULL::uuid AS vault_id,
          NULL::text AS vault_name, NULL::text AS vault_emoji
        FROM income
        UNION ALL
        SELECT 'vault-contribution'::text AS type, contribution.id,
          NULL::text AS description, NULL::text AS source, NULL::text AS category,
          contribution.amount, contribution.created_at, contribution.vault_id,
          vault.name AS vault_name, vault.emoji AS vault_emoji
        FROM vault_contributions contribution
        INNER JOIN vaults vault ON vault.id = contribution.vault_id
      )
      SELECT
        type, id, description, source, category, amount,
        created_at AS "createdAt", vault_id AS "vaultId",
        vault_name AS "vaultName", vault_emoji AS "vaultEmoji",
        to_char(created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS date
      FROM activity
      WHERE created_at >= ${from.toISOString()}::timestamptz
        AND created_at < ${toExclusive.toISOString()}::timestamptz
      ORDER BY created_at DESC, id DESC
    `);
    return result.rows as unknown as CalendarActivityRow[];
  }
}
