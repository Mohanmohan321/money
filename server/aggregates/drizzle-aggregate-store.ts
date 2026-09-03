import { sql, type SQL } from 'drizzle-orm';
import { DateTime } from 'luxon';

import type {
  AnalyticsData,
  CategoryStatistics,
  DashboardData,
  HistoryItem,
  IncomeCategory,
  MovementPoint,
  SpendingCategory,
} from '../../shared/contracts';
import type { AppDatabase } from '../db/client';
import type {
  AggregateStore,
  AnalyticsStoreQuery,
  DashboardStoreQuery,
  HistoryStoreQuery,
} from './store';

export function fillDailySeries(
  from: Date,
  toExclusive: Date,
  timezone: string,
  points: MovementPoint[],
): MovementPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const result: MovementPoint[] = [];
  let cursor = DateTime.fromJSDate(from, { zone: timezone }).startOf('day');
  const end = DateTime.fromJSDate(toExclusive, { zone: timezone }).startOf('day');

  while (cursor < end) {
    const date = cursor.toFormat('yyyy-MM-dd');
    result.push(
      byDate.get(date) ?? {
        date,
        transactionAmount: '0.00',
        lentAmount: '0.00',
        borrowedAmount: '0.00',
      },
    );
    cursor = cursor.plus({ days: 1 });
  }
  return result;
}

const financialRecords = sql`
  SELECT 'transaction'::text AS type, id, description, NULL::text AS person_name,
    NULL::text AS source, category, amount, created_at
  FROM transactions
  UNION ALL
  SELECT 'lent'::text AS type, id, NULL::text AS description, person_name,
    NULL::text AS source, NULL::text AS category, amount, created_at
  FROM money_lent
  UNION ALL
  SELECT 'borrowed'::text AS type, id, NULL::text AS description, person_name,
    NULL::text AS source, NULL::text AS category, amount, created_at
  FROM money_borrowed
`;

const historyRecords = sql`
  ${financialRecords}
  UNION ALL
  SELECT 'income'::text AS type, id, NULL::text AS description, NULL::text AS person_name,
    source, category, amount, created_at
  FROM income
`;

function historyFilters(query: HistoryStoreQuery): SQL {
  const filters: SQL[] = [];
  if (query.type) filters.push(sql`type = ${query.type}`);
  if (query.from) filters.push(sql`created_at >= ${query.from.toISOString()}::timestamptz`);
  if (query.toExclusive) filters.push(sql`created_at < ${query.toExclusive.toISOString()}::timestamptz`);
  return filters.length > 0 ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql.empty();
}

function asHistoryItem(value: unknown): HistoryItem {
  const item = value as Record<string, unknown>;
  const base = {
    id: String(item.id),
    amount: String(item.amount),
    createdAt: String(item.createdAt),
  };
  if (item.type === 'transaction') {
    return {
      ...base,
      type: 'transaction',
      description: String(item.description),
      category: item.category as SpendingCategory,
    };
  }
  if (item.type === 'lent' || item.type === 'borrowed') {
    return { ...base, type: item.type, personName: String(item.personName) };
  }
  if (item.type === 'income') {
    return {
      ...base,
      type: 'income',
      source: String(item.source),
      category: item.category as IncomeCategory,
    };
  }
  throw new Error('Database returned an unknown financial record type');
}

interface DashboardTotalsRow {
  todayTransactions: string;
  todayLent: string;
  todayBorrowed: string;
  todayTransactionCount: number;
  todayLendingCount: number;
  todayBorrowingCount: number;
  weekTransactions: string;
  weekLent: string;
  weekBorrowed: string;
  weekRecordCount: number;
  monthTransactions: string;
  monthLent: string;
  monthBorrowed: string;
  monthRecordCount: number;
}

interface MovementRow {
  date: string;
  transactionAmount: string;
  lentAmount: string;
  borrowedAmount: string;
}

interface StatisticsRow {
  type: 'transaction' | 'lent' | 'borrowed';
  totalAmount: string;
  count: number;
  averageAmount: string;
  largestAmount: string;
  smallestAmount: string;
}

interface PersonRow {
  type: 'lent' | 'borrowed';
  personName: string;
  totalAmount: string;
  count: number;
}

function movementPoint(row: MovementRow): MovementPoint {
  return {
    date: String(row.date),
    transactionAmount: String(row.transactionAmount),
    lentAmount: String(row.lentAmount),
    borrowedAmount: String(row.borrowedAmount),
  };
}

function emptyStatistics(): CategoryStatistics {
  return {
    totalAmount: '0.00',
    count: 0,
    averageAmount: '0.00',
    largestAmount: '0.00',
    smallestAmount: '0.00',
  };
}

function bucketExpression(period: AnalyticsStoreQuery['period'], timezone: string): SQL {
  const localTimestamp = sql`created_at AT TIME ZONE ${timezone}`;
  switch (period) {
    case 'day':
      return sql`to_char(${localTimestamp}, 'YYYY-MM-DD')`;
    case 'week':
      return sql`to_char(date_trunc('week', ${localTimestamp}), 'YYYY-MM-DD')`;
    case 'month':
      return sql`to_char(date_trunc('month', ${localTimestamp}), 'YYYY-MM')`;
    case 'year':
      return sql`to_char(date_trunc('year', ${localTimestamp}), 'YYYY')`;
  }
}

export class DrizzleAggregateStore implements AggregateStore {
  constructor(private readonly database: AppDatabase) {}

  async getHistory(query: HistoryStoreQuery) {
    const result = await this.database.execute(sql<{ total: number; items: unknown[] }>`
      WITH records AS (${historyRecords}),
      filtered AS (
        SELECT * FROM records
        ${historyFilters(query)}
      ),
      page AS (
        SELECT * FROM filtered
        ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit} OFFSET ${query.offset}
      )
      SELECT
        (SELECT count(*)::int FROM filtered) AS total,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', id,
              'type', type,
              'description', description,
              'personName', person_name,
              'source', source,
              'category', category,
              'amount', amount::text,
              'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            ) ORDER BY created_at DESC, id DESC
          ) FROM page),
          '[]'::json
        ) AS items
    `);
    const row = result.rows[0];
    const rawItems = Array.isArray(row?.items) ? row.items : [];
    return { items: rawItems.map(asHistoryItem), total: Number(row?.total ?? 0) };
  }

  async getDashboard({ timezone, ranges }: DashboardStoreQuery): Promise<DashboardData> {
    const seriesFrom = ranges.week.from < ranges.month.from ? ranges.week.from : ranges.month.from;
    const seriesTo = ranges.week.toExclusive > ranges.month.toExclusive
      ? ranges.week.toExclusive
      : ranges.month.toExclusive;

    const [totalsResult, dailyResult] = await Promise.all([
      this.database.execute(sql<DashboardTotalsRow>`
        WITH records AS (${financialRecords})
        SELECT
          COALESCE(sum(amount) FILTER (WHERE type = 'transaction' AND created_at >= ${ranges.today.from.toISOString()}::timestamptz AND created_at < ${ranges.today.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "todayTransactions",
          COALESCE(sum(amount) FILTER (WHERE type = 'lent' AND created_at >= ${ranges.today.from.toISOString()}::timestamptz AND created_at < ${ranges.today.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "todayLent",
          COALESCE(sum(amount) FILTER (WHERE type = 'borrowed' AND created_at >= ${ranges.today.from.toISOString()}::timestamptz AND created_at < ${ranges.today.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "todayBorrowed",
          count(*) FILTER (WHERE type = 'transaction' AND created_at >= ${ranges.today.from.toISOString()}::timestamptz AND created_at < ${ranges.today.toExclusive.toISOString()}::timestamptz)::int AS "todayTransactionCount",
          count(*) FILTER (WHERE type = 'lent' AND created_at >= ${ranges.today.from.toISOString()}::timestamptz AND created_at < ${ranges.today.toExclusive.toISOString()}::timestamptz)::int AS "todayLendingCount",
          count(*) FILTER (WHERE type = 'borrowed' AND created_at >= ${ranges.today.from.toISOString()}::timestamptz AND created_at < ${ranges.today.toExclusive.toISOString()}::timestamptz)::int AS "todayBorrowingCount",
          COALESCE(sum(amount) FILTER (WHERE type = 'transaction' AND created_at >= ${ranges.week.from.toISOString()}::timestamptz AND created_at < ${ranges.week.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "weekTransactions",
          COALESCE(sum(amount) FILTER (WHERE type = 'lent' AND created_at >= ${ranges.week.from.toISOString()}::timestamptz AND created_at < ${ranges.week.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "weekLent",
          COALESCE(sum(amount) FILTER (WHERE type = 'borrowed' AND created_at >= ${ranges.week.from.toISOString()}::timestamptz AND created_at < ${ranges.week.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "weekBorrowed",
          count(*) FILTER (WHERE created_at >= ${ranges.week.from.toISOString()}::timestamptz AND created_at < ${ranges.week.toExclusive.toISOString()}::timestamptz)::int AS "weekRecordCount",
          COALESCE(sum(amount) FILTER (WHERE type = 'transaction' AND created_at >= ${ranges.month.from.toISOString()}::timestamptz AND created_at < ${ranges.month.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "monthTransactions",
          COALESCE(sum(amount) FILTER (WHERE type = 'lent' AND created_at >= ${ranges.month.from.toISOString()}::timestamptz AND created_at < ${ranges.month.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "monthLent",
          COALESCE(sum(amount) FILTER (WHERE type = 'borrowed' AND created_at >= ${ranges.month.from.toISOString()}::timestamptz AND created_at < ${ranges.month.toExclusive.toISOString()}::timestamptz), 0)::numeric(20,2)::text AS "monthBorrowed",
          count(*) FILTER (WHERE created_at >= ${ranges.month.from.toISOString()}::timestamptz AND created_at < ${ranges.month.toExclusive.toISOString()}::timestamptz)::int AS "monthRecordCount"
        FROM records
      `),
      this.database.execute(sql<MovementRow>`
        WITH records AS (${financialRecords})
        SELECT
          to_char(created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS date,
          COALESCE(sum(amount) FILTER (WHERE type = 'transaction'), 0)::numeric(20,2)::text AS "transactionAmount",
          COALESCE(sum(amount) FILTER (WHERE type = 'lent'), 0)::numeric(20,2)::text AS "lentAmount",
          COALESCE(sum(amount) FILTER (WHERE type = 'borrowed'), 0)::numeric(20,2)::text AS "borrowedAmount"
        FROM records
        WHERE created_at >= ${seriesFrom.toISOString()}::timestamptz
          AND created_at < ${seriesTo.toISOString()}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const totals = totalsResult.rows[0] as unknown as DashboardTotalsRow | undefined;
    const points = dailyResult.rows.map((row) => movementPoint(row as unknown as MovementRow));
    return {
      timezone,
      today: {
        totalTransactions: totals?.todayTransactions ?? '0.00',
        totalLent: totals?.todayLent ?? '0.00',
        totalBorrowed: totals?.todayBorrowed ?? '0.00',
        transactionCount: Number(totals?.todayTransactionCount ?? 0),
        lendingCount: Number(totals?.todayLendingCount ?? 0),
        borrowingCount: Number(totals?.todayBorrowingCount ?? 0),
      },
      week: {
        totalTransactions: totals?.weekTransactions ?? '0.00',
        totalLent: totals?.weekLent ?? '0.00',
        totalBorrowed: totals?.weekBorrowed ?? '0.00',
        recordCount: Number(totals?.weekRecordCount ?? 0),
        daily: fillDailySeries(ranges.week.from, ranges.week.toExclusive, timezone, points),
      },
      month: {
        totalTransactions: totals?.monthTransactions ?? '0.00',
        totalLent: totals?.monthLent ?? '0.00',
        totalBorrowed: totals?.monthBorrowed ?? '0.00',
        recordCount: Number(totals?.monthRecordCount ?? 0),
        daily: fillDailySeries(ranges.month.from, ranges.month.toExclusive, timezone, points),
      },
    };
  }

  async getAnalytics(query: AnalyticsStoreQuery): Promise<AnalyticsData> {
    const bucket = bucketExpression(query.period, query.timezone);
    const [movementResult, statisticsResult, peopleResult] = await Promise.all([
      this.database.execute(sql<MovementRow>`
        WITH records AS (${financialRecords})
        SELECT
          ${bucket} AS date,
          COALESCE(sum(amount) FILTER (WHERE type = 'transaction'), 0)::numeric(20,2)::text AS "transactionAmount",
          COALESCE(sum(amount) FILTER (WHERE type = 'lent'), 0)::numeric(20,2)::text AS "lentAmount",
          COALESCE(sum(amount) FILTER (WHERE type = 'borrowed'), 0)::numeric(20,2)::text AS "borrowedAmount"
        FROM records
        WHERE created_at >= ${query.from.toISOString()}::timestamptz
          AND created_at < ${query.toExclusive.toISOString()}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `),
      this.database.execute(sql<StatisticsRow>`
        WITH records AS (${financialRecords})
        SELECT
          type,
          COALESCE(sum(amount), 0)::numeric(20,2)::text AS "totalAmount",
          count(*)::int AS count,
          COALESCE(avg(amount), 0)::numeric(20,2)::text AS "averageAmount",
          COALESCE(max(amount), 0)::numeric(20,2)::text AS "largestAmount",
          COALESCE(min(amount), 0)::numeric(20,2)::text AS "smallestAmount"
        FROM records
        WHERE created_at >= ${query.from.toISOString()}::timestamptz
          AND created_at < ${query.toExclusive.toISOString()}::timestamptz
        GROUP BY type
      `),
      this.database.execute(sql<PersonRow>`
        WITH people AS (
          SELECT 'lent'::text AS type, person_name, amount, created_at FROM money_lent
          UNION ALL
          SELECT 'borrowed'::text AS type, person_name, amount, created_at FROM money_borrowed
        )
        SELECT
          type,
          person_name AS "personName",
          sum(amount)::numeric(20,2)::text AS "totalAmount",
          count(*)::int AS count
        FROM people
        WHERE created_at >= ${query.from.toISOString()}::timestamptz
          AND created_at < ${query.toExclusive.toISOString()}::timestamptz
        GROUP BY type, person_name
        ORDER BY type, sum(amount) DESC, person_name
      `),
    ]);

    const statistics = new Map(statisticsResult.rows.map((row) => [row.type, {
      totalAmount: String(row.totalAmount),
      count: Number(row.count),
      averageAmount: String(row.averageAmount),
      largestAmount: String(row.largestAmount),
      smallestAmount: String(row.smallestAmount),
    }]));
    const transactionStatistics = statistics.get('transaction') ?? emptyStatistics();
    const lendingStatistics = statistics.get('lent') ?? emptyStatistics();
    const borrowingStatistics = statistics.get('borrowed') ?? emptyStatistics();

    return {
      period: query.period,
      timezone: query.timezone,
      from: query.fromLabel,
      to: query.toLabel,
      movement: movementResult.rows.map((row) => movementPoint(row as unknown as MovementRow)),
      transactions: transactionStatistics,
      lending: {
        totalAmount: lendingStatistics.totalAmount,
        count: lendingStatistics.count,
        averageAmount: lendingStatistics.averageAmount,
        largestAmount: lendingStatistics.largestAmount,
      },
      borrowing: {
        totalAmount: borrowingStatistics.totalAmount,
        count: borrowingStatistics.count,
        averageAmount: borrowingStatistics.averageAmount,
        largestAmount: borrowingStatistics.largestAmount,
      },
      lendingByPerson: peopleResult.rows
        .filter((row) => row.type === 'lent')
        .map((row) => ({
          personName: String(row.personName),
          totalAmount: String(row.totalAmount),
          numberOfLoans: Number(row.count),
        })),
      borrowingByPerson: peopleResult.rows
        .filter((row) => row.type === 'borrowed')
        .map((row) => ({
          personName: String(row.personName),
          totalAmount: String(row.totalAmount),
          numberOfBorrowings: Number(row.count),
        })),
    };
  }
}
