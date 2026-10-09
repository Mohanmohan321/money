import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { neon } from '@neondatabase/serverless';
import Decimal from 'decimal.js';
import { and, eq, gte, lt } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAggregateStore } from '../aggregates/drizzle-aggregate-store';
import { DrizzleSessionStore } from '../auth/drizzle-session-store';
import { hashSessionToken } from '../auth/session';
import { DrizzleBudgetStore } from '../budgets/drizzle-budget-store';
import { DrizzleBudgetCalendarStore } from '../budget-calendar/drizzle-budget-calendar-store';
import { DrizzleNetWorthStore } from '../net-worth/drizzle-net-worth-store';
import { DrizzlePlanningStore } from '../planning/drizzle-planning-store';
import { DrizzleRecordStore } from '../records/drizzle-record-store';
import { DrizzleSubscriptionStore } from '../subscriptions/drizzle-subscription-store';
import { DrizzleVaultStore } from '../vaults/drizzle-vault-store';
import { monthRange, weekRangeContaining, yearRange } from '../lib/time';
import { createDatabase, type AppDatabase } from './client';
import {
  assets,
  budgetCalendarExpenses,
  income,
  liabilities,
  monthlyBudgets,
  subscriptionReviews,
  transactions,
  vaultContributions,
  vaults,
} from './schema';
import { CleanupRegistry, settleAndRegister } from './integration-cleanup';

const GENERAL_SAVINGS_VAULT_ID = '00000000-0000-4000-8000-000000000001';
const MAX_MONEY = '999999999999999999.99';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const disposableDatabaseConfirmed = process.env.TEST_DATABASE_DISPOSABLE === 'true';

interface IntegrationStores {
  database: AppDatabase;
  records: DrizzleRecordStore;
  budgets: DrizzleBudgetStore;
  vaultStore: DrizzleVaultStore;
  netWorth: DrizzleNetWorthStore;
  planning: DrizzlePlanningStore;
  aggregates: DrizzleAggregateStore;
  sessions: DrizzleSessionStore;
  subscriptions: DrizzleSubscriptionStore;
  budgetCalendar: DrizzleBudgetCalendarStore;
}

let stores: IntegrationStores | undefined;

function requireDisposableDatabaseUrl(): string {
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for database integration tests; use a disposable Neon branch',
    );
  }
  if (!disposableDatabaseConfirmed) {
    throw new Error(
      'TEST_DATABASE_DISPOSABLE=true is required before migrations can run against TEST_DATABASE_URL',
    );
  }
  return testDatabaseUrl;
}

function testStores(): IntegrationStores {
  if (!stores) throw new Error('Database integration test setup did not complete');
  return stores;
}

function splitMigration(source: string): string[] {
  return source
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function allocateBudgetMonths(database: AppDatabase): Promise<[string, string]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const seed = Number.parseInt(randomUUID().slice(0, 8), 16);
    const year = String(1000 + (seed % 8000)).padStart(4, '0');
    const monthNumber = 1 + (seed % 11);
    const first = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const second = `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
    const existing = await Promise.all([first, second].map(async (month) => (
      database.select({ month: monthlyBudgets.month })
        .from(monthlyBudgets)
        .where(eq(monthlyBudgets.month, month))
        .limit(1)
    )));
    if (existing.every((rows) => rows.length === 0)) return [first, second];
  }
  throw new Error('Could not allocate unique integration-test budget months');
}

async function allocatePlanningYear(database: AppDatabase): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const seed = Number.parseInt(randomUUID().slice(0, 8), 16);
    const year = String(6000 + (seed % 3000));
    const previousDecember = `${Number(year) - 1}-12`;
    const nextJanuary = `${Number(year) + 1}-01`;
    const from = new Date(`${year}-01-01T00:00:00.000Z`);
    const toExclusive = new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`);
    const existing = await Promise.all([
      database.select({ month: monthlyBudgets.month }).from(monthlyBudgets)
        .where(and(gte(monthlyBudgets.month, previousDecember), lt(monthlyBudgets.month, nextJanuary)))
        .limit(1),
      database.select({ id: transactions.id }).from(transactions)
        .where(and(gte(transactions.createdAt, from), lt(transactions.createdAt, toExclusive))).limit(1),
      database.select({ id: income.id }).from(income)
        .where(and(gte(income.createdAt, from), lt(income.createdAt, toExclusive))).limit(1),
      database.select({ id: vaultContributions.id }).from(vaultContributions)
        .where(and(gte(vaultContributions.createdAt, from), lt(vaultContributions.createdAt, toExclusive))).limit(1),
    ]);
    if (existing.every((rows) => rows.length === 0)) return year;
  }
  throw new Error('Could not allocate a clean integration-test planning year');
}

beforeAll(async () => {
  const databaseUrl = requireDisposableDatabaseUrl();
  const database = createDatabase(databaseUrl);
  await migrate(database, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  stores = {
    database,
    records: new DrizzleRecordStore(database),
    budgets: new DrizzleBudgetStore(database),
    vaultStore: new DrizzleVaultStore(database),
    netWorth: new DrizzleNetWorthStore(database),
    planning: new DrizzlePlanningStore(database, new DrizzleBudgetStore(database)),
    aggregates: new DrizzleAggregateStore(database),
    sessions: new DrizzleSessionStore(database),
    subscriptions: new DrizzleSubscriptionStore(database),
    budgetCalendar: new DrizzleBudgetCalendarStore(database),
  };
}, 120_000);

describe.sequential('disposable Neon PostgreSQL integration', () => {
  it('persists isolated Budget Calendar expenses without creating transactions', async () => {
    const { database, budgetCalendar, records } = testStores();
    const date = '2099-10-09';
    const from = new Date('2099-10-09T00:00:00.000Z');
    const toExclusive = new Date('2099-10-10T00:00:00.000Z');
    const beforeTransactions = (await records.listTransactions({ from, toExclusive })).length;
    const selectedCategory = (await budgetCalendar.listCategories()).find(({ active }) => active);
    expect(selectedCategory).toBeTruthy();
    const created = await budgetCalendar.createExpense({
      expenseDate: date,
      categoryId: selectedCategory!.id,
      amount: '250.05',
      description: `Integration calendar expense ${randomUUID()}`,
      idempotencyKey: randomUUID(),
    });
    expect(created.outcome).toBe('created');
    if (created.outcome === 'invalid_category') {
      throw new Error('Seeded Budget Calendar category was rejected');
    }
    const expense = created.expense;
    const cleanup = new CleanupRegistry();
    cleanup.add(() => database.delete(budgetCalendarExpenses)
      .where(eq(budgetCalendarExpenses.id, expense.id)));

    try {
      const day = await budgetCalendar.getDay(date, date);
      expect(day).toEqual(expect.objectContaining({
        actualAmount: '250.05', recordState: 'recorded_with_expenses',
      }));
      expect((await records.listTransactions({ from, toExclusive })).length)
        .toBe(beforeTransactions);
    } finally {
      await cleanup.run();
    }
  });

  it('applies the production migrations to a legacy schema and verifies the category backfill', async () => {
    const databaseUrl = requireDisposableDatabaseUrl();
    const sqlClient = neon(databaseUrl);
    const isolatedSchema = `budgeting_migration_${randomUUID().replaceAll('-', '')}`;
    const legacyDescription = `Legacy transaction ${randomUUID()}`;
    const migration0 = await readFile(resolve(process.cwd(), 'drizzle/0000_robust_anita_blake.sql'), 'utf8');
    const migration1 = await readFile(resolve(process.cwd(), 'drizzle/0001_budgeting_foundation.sql'), 'utf8');
    const migration2 = await readFile(resolve(process.cwd(), 'drizzle/0002_subscriptions.sql'), 'utf8');
    const migration3 = await readFile(resolve(process.cwd(), 'drizzle/0003_flaky_living_lightning.sql'), 'utf8');
    const migration4 = await readFile(resolve(process.cwd(), 'drizzle/0004_purple_xorn.sql'), 'utf8');
    const isolatedMigration1 = migration1.replaceAll(
      '"public"."vaults"',
      `"${isolatedSchema}"."vaults"`,
    );
    const cleanup = new CleanupRegistry();
    cleanup.add(() => sqlClient.query(`drop schema if exists "${isolatedSchema}" cascade`));

    try {
      await sqlClient.query(`create schema "${isolatedSchema}"`);
      await sqlClient.transaction((transaction) => [
        transaction.query(`set local search_path to "${isolatedSchema}"`),
        ...splitMigration(migration0).map((statement) => transaction.query(statement)),
        transaction.query(
          'insert into transactions (description, amount) values ($1, $2)',
          [legacyDescription, '10.10'],
        ),
        ...splitMigration(isolatedMigration1).map((statement) => transaction.query(statement)),
        ...splitMigration(migration2).map((statement) => transaction.query(statement)),
        ...splitMigration(migration3).map((statement) => transaction.query(statement)),
        ...splitMigration(migration4).map((statement) => transaction.query(statement)),
      ]);

      const backfilled = await sqlClient.query(
        `select category from "${isolatedSchema}".transactions where description = $1`,
        [legacyDescription],
      );
      expect(backfilled).toEqual([{ category: 'other' }]);

      const categoryColumn = await sqlClient.query(
        `select is_nullable from information_schema.columns
         where table_schema = $1 and table_name = 'transactions' and column_name = 'category'`,
        [isolatedSchema],
      );
      expect(categoryColumn).toEqual([{ is_nullable: 'NO' }]);

      const budgetCalendarSeed = await sqlClient.query(
        `select count(*)::int as count, sum(monthly_amount)::text as total
         from "${isolatedSchema}".budget_calendar_categories`,
      );
      expect(budgetCalendarSeed).toEqual([{ count: 12, total: '10000.00' }]);

      await expect(sqlClient.query(
        `insert into "${isolatedSchema}".income (source, category, amount)
         values ($1, $2, $3)`,
        ['Constraint probe', 'other', '0.00'],
      )).rejects.toThrow();
    } finally {
      await cleanup.run();
    }
  });

  it('persists subscription review forecasts without changing actual spending and marks only actual payments', async () => {
    const { database, subscriptions, planning } = testStores();
    const year = await allocatePlanningYear(database);
    const suffix = randomUUID().replace(/[^a-f]/g, '');
    const description = `Recurring Service ${suffix}`;
    const transactionIds = [randomUUID(), randomUUID()];
    const firstAt = new Date(`${year}-07-02T10:00:00.000Z`);
    const secondAt = new Date(`${year}-08-01T10:00:00.000Z`);
    const detectionNow = new Date(`${year}-08-02T00:00:00.000Z`);
    const cleanup = new CleanupRegistry();
    try {
      await database.insert(transactions).values([
        { id: transactionIds[0], description: `${description} payment`, category: 'bills', amount: '649.00', createdAt: firstAt },
        { id: transactionIds[1], description: `${description} order 849201`, category: 'bills', amount: '699.00', createdAt: secondAt },
      ]);
      cleanup.add(() => database.delete(transactions).where(eq(transactions.id, transactionIds[0])));
      cleanup.add(() => database.delete(transactions).where(eq(transactions.id, transactionIds[1])));

      const before = await subscriptions.listCandidates(detectionNow, 'UTC');
      const candidate = before.items.find((item) => item.supportingTransactionIds.includes(transactionIds[0]));
      expect(candidate).toEqual(expect.objectContaining({
        reviewStatus: 'pending', typicalAmount: '674.00', monthlyEquivalent: '674.00',
        supportingTransactionIds: transactionIds,
      }));
      const merchantKey = candidate!.merchantKey;
      cleanup.add(() => database.delete(subscriptionReviews).where(eq(subscriptionReviews.merchantKey, merchantKey)));

      const augustRange = monthRange(`${year}-08`, 'UTC');
      const week = weekRangeContaining(`${year}-08-01`, 'UTC');
      const actualBefore = await planning.getMonthly({
        month: `${year}-08`, timezone: 'UTC', range: augustRange, week,
        weekFromLabel: `${year}-07-27`, weekToLabel: `${year}-08-02`,
      });
      await subscriptions.reviewCandidate(merchantKey, 'confirmed', detectionNow, 'UTC');
      const reviewed = await subscriptions.listCandidates(detectionNow, 'UTC');
      expect(reviewed.confirmedMonthlyForecast).toMatch(/^\d+\.\d{2}$/);
      expect(reviewed.confirmedMonthlyForecast).toBe('674.00');
      const actualAfter = await planning.getMonthly({
        month: `${year}-08`, timezone: 'UTC', range: augustRange, week,
        weekFromLabel: `${year}-07-27`, weekToLabel: `${year}-08-02`,
      });
      expect(actualAfter.summary.spending).toBe(actualBefore.summary.spending);

      const annualRange = yearRange(year, 'UTC');
      const breakdown = await planning.getBreakdown({
        year, selectedMonth: `${year}-08`, timezone: 'UTC', yearRange: annualRange,
        monthRange: augustRange,
      });
      expect(breakdown.days[0]).toEqual(expect.objectContaining({
        spending: '699.00', subscriptionPaymentCount: 1,
      }));
      expect(breakdown.days.every((day) => day.date <= `${year}-08-31`)).toBe(true);
    } finally {
      await cleanup.run();
    }
  });

  it('persists all record types, preserves decimal strings, aggregates them, and enforces constraints', async () => {
    const { database, records, aggregates } = testStores();
    const suffix = randomUUID();
    const description = `Integration transaction ${suffix}`;
    const lender = `Integration lender ${suffix}`;
    const borrower = `Integration borrower ${suffix}`;
    const cleanup = new CleanupRegistry();
    const from = new Date(Date.now() - 5 * 60_000);
    const toExclusive = new Date(Date.now() + 5 * 60_000);

    try {
      const transaction = await records.createTransaction({ description, amount: '10.10' });
      cleanup.add(() => records.deleteTransaction(transaction.id));
      const lent = await records.createLent({ personName: lender, amount: '20.20' });
      cleanup.add(() => records.deleteLent(lent.id));
      const borrowed = await records.createBorrowed({ personName: borrower, amount: '30.30' });
      cleanup.add(() => records.deleteBorrowed(borrowed.id));

      expect(await records.getTransaction(transaction.id)).toEqual(expect.objectContaining({
        amount: '10.10',
        category: 'other',
      }));
      expect((await records.getLent(lent.id))?.amount).toBe('20.20');
      expect((await records.getBorrowed(borrowed.id))?.amount).toBe('30.30');
      expect(transaction.createdAt).toMatch(/Z$/);

      const history = await aggregates.getHistory({ from, toExclusive, limit: 100, offset: 0 });
      expect(history.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: transaction.id,
          type: 'transaction',
          description,
          category: 'other',
          amount: '10.10',
        }),
        expect.objectContaining({ id: lent.id, type: 'lent', personName: lender, amount: '20.20' }),
        expect.objectContaining({ id: borrowed.id, type: 'borrowed', personName: borrower, amount: '30.30' }),
      ]));

      const analytics = await aggregates.getAnalytics({
        period: 'day', timezone: 'UTC', from, toExclusive,
        fromLabel: from.toISOString().slice(0, 10),
        toLabel: toExclusive.toISOString().slice(0, 10),
      });
      expect(analytics.lendingByPerson).toContainEqual({ personName: lender, totalAmount: '20.20', numberOfLoans: 1 });
      expect(analytics.borrowingByPerson).toContainEqual({ personName: borrower, totalAmount: '30.30', numberOfBorrowings: 1 });

      const constraintProbeId = randomUUID();
      cleanup.add(() => records.deleteTransaction(constraintProbeId));
      await expect(database.insert(transactions).values({
        id: constraintProbeId,
        description: `Constraint probe ${suffix}`,
        category: 'other',
        amount: '0.00',
      })).rejects.toThrow();
    } finally {
      await cleanup.run();
    }
  });

  it('persists only a session digest and revokes it', async () => {
    const { sessions } = testStores();
    const token = `integration-${randomUUID()}`;
    const digest = hashSessionToken(token);
    const cleanup = new CleanupRegistry();
    try {
      await sessions.create(digest, new Date(Date.now() + 60_000));
      cleanup.add(() => sessions.delete(digest));
      expect(await sessions.isValid(digest, new Date())).toBe(true);
      expect(await sessions.isValid(hashSessionToken(token), new Date())).toBe(true);
    } finally {
      await cleanup.run();
    }
    expect(await sessions.isValid(digest, new Date())).toBe(false);
  });

  it('carries budgets forward and updates income through the production store', async () => {
    const { database, budgets } = testStores();
    const suffix = randomUUID();
    const [savedMonth, suggestedMonth] = await allocateBudgetMonths(database);
    const cleanup = new CleanupRegistry();
    cleanup.add(() => database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, suggestedMonth)));
    cleanup.add(() => database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, savedMonth)));

    try {
      await budgets.upsertBudget(savedMonth, {
        salary: '1000.10',
        spendingLimit: '800.80',
        savingsTarget: '200.20',
      });
      expect(await budgets.getBudget(suggestedMonth)).toEqual({
        month: suggestedMonth,
        salary: '1000.10',
        spendingLimit: '800.80',
        savingsTarget: '200.20',
        source: 'suggested',
      });

      const created = await budgets.createIncome({
        source: `Integration income ${suffix}`,
        category: 'freelance',
        amount: '40.40',
      });
      cleanup.add(() => budgets.deleteIncome(created.id));
      const correctedAt = new Date(Date.now() - 30_000).toISOString();
      expect(await budgets.updateIncome(created.id, {
        source: `Corrected income ${suffix}`,
        category: 'bonus',
        amount: '41.41',
        createdAt: correctedAt,
      })).toEqual(expect.objectContaining({
        id: created.id,
        source: `Corrected income ${suffix}`,
        category: 'bonus',
        amount: '41.41',
        createdAt: correctedAt,
      }));
    } finally {
      await cleanup.run();
    }
  });

  it('maps monthly, breakdown, and annual planning boundaries through the production store', async () => {
    const { database, budgets, planning } = testStores();
    const year = await allocatePlanningYear(database);
    const previousDecember = `${Number(year) - 1}-12`;
    const january = `${year}-01`;
    const february = `${year}-02`;
    const suffix = randomUUID();
    const source = `Planning boundary income ${suffix}`;
    const transactionIds = [randomUUID(), randomUUID()];
    const incomeId = randomUUID();
    const vaultId = randomUUID();
    const contributionId = randomUUID();
    const cleanup = new CleanupRegistry();
    cleanup.add(() => database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, previousDecember)));
    cleanup.add(() => database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, february)));

    try {
      await budgets.upsertBudget(previousDecember, {
        salary: '100.00', spendingLimit: '80.00', savingsTarget: '20.00',
      });
      await budgets.upsertBudget(february, {
        salary: '200.00', spendingLimit: '150.00', savingsTarget: '50.00',
      });
      await database.insert(income).values({
        id: incomeId, source, category: 'other', amount: '0.03',
        createdAt: new Date(`${year}-01-01T00:00:00.000Z`),
      });
      cleanup.add(() => database.delete(income).where(eq(income.id, incomeId)));
      await database.insert(transactions).values([
        {
          id: transactionIds[0], description: `January boundary ${suffix}`, category: 'food',
          amount: '0.01', createdAt: new Date(`${year}-01-31T23:59:59.999Z`),
        },
        {
          id: transactionIds[1], description: `February boundary ${suffix}`, category: 'travel',
          amount: '0.04', createdAt: new Date(`${year}-02-01T00:00:00.000Z`),
        },
      ]);
      cleanup.add(() => database.delete(transactions).where(eq(transactions.id, transactionIds[0])));
      cleanup.add(() => database.delete(transactions).where(eq(transactions.id, transactionIds[1])));
      await database.insert(vaults).values({
        id: vaultId, name: `Planning Vault ${suffix}`, emoji: 'PV', targetAmount: '1.00',
      });
      cleanup.add(() => database.delete(vaults).where(eq(vaults.id, vaultId)));
      await database.insert(vaultContributions).values({
        id: contributionId, vaultId, amount: '0.02',
        createdAt: new Date(`${year}-01-15T12:00:00.000Z`),
      });
      cleanup.add(() => database.delete(vaultContributions)
        .where(eq(vaultContributions.id, contributionId)));

      const januaryRange = monthRange(january, 'UTC');
      const januaryWeek = weekRangeContaining(`${year}-01-15`, 'UTC');
      const monthly = await planning.getMonthly({
        month: january, timezone: 'UTC', range: januaryRange, week: januaryWeek,
        weekFromLabel: `${year}-01-13`, weekToLabel: `${year}-01-19`,
      });
      expect(monthly.budget).toEqual(expect.objectContaining({
        month: january, source: 'suggested', salary: '100.00', spendingLimit: '80.00',
      }));
      expect(monthly.summary).toEqual(expect.objectContaining({
        income: '100.03', spending: '0.01', savings: '0.02', amountLeft: '100.00',
      }));
      expect(monthly.categories[0]).toEqual({
        category: 'food', amount: '0.01', percentage: '100.00',
      });

      const annualRange = yearRange(year, 'UTC');
      const breakdown = await planning.getBreakdown({
        year, selectedMonth: january, timezone: 'UTC', yearRange: annualRange,
        monthRange: januaryRange,
      });
      expect(breakdown.months[0]).toEqual(expect.objectContaining({
        month: january, income: '100.03', spending: '0.01', savings: '0.02',
      }));
      expect(breakdown.months[1]).toEqual(expect.objectContaining({
        month: february, income: '200.00', spending: '0.04', savings: '0.00',
      }));
      expect(breakdown.days).toHaveLength(31);
      expect(breakdown.days[0]?.income).toBe('0.03');
      expect(breakdown.days[14]).toEqual(expect.objectContaining({
        savings: '0.02', vaultContributionCount: 1, subscriptionPaymentCount: 0,
      }));
      expect(breakdown.days[30]?.spending).toBe('0.01');

      const annual = await planning.getAnnual({
        year, timezone: 'UTC', range: annualRange,
      });
      expect(annual.summary).toEqual(expect.objectContaining({
        income: '2300.03', spending: '0.05', savings: '0.02', amountLeft: '2299.96',
        spendingRemaining: '1729.95',
      }));
      expect(annual.incomeBySource).toContainEqual(expect.objectContaining({
        source, amount: '0.03',
      }));
      expect(annual.highestSpendingMonth).toBe(february);
      expect(annual.bestSavingMonth).toBe(january);
    } finally {
      await cleanup.run();
    }
  });

  it('protects and repairs General Savings while preserving its financial settings', async () => {
    const { database, vaultStore } = testStores();
    const canonicalBefore = await vaultStore.getVault(GENERAL_SAVINGS_VAULT_ID);
    const cleanup = new CleanupRegistry();
    cleanup.add(canonicalBefore
      ? () => database.update(vaults).set({
        name: canonicalBefore.name,
        emoji: canonicalBefore.emoji,
        targetAmount: canonicalBefore.targetAmount,
        targetDate: canonicalBefore.targetDate ?? null,
        status: canonicalBefore.status,
        updatedAt: new Date(canonicalBefore.updatedAt),
      }).where(eq(vaults.id, GENERAL_SAVINGS_VAULT_ID))
      : () => database.delete(vaults).where(eq(vaults.id, GENERAL_SAVINGS_VAULT_ID)));

    try {
      await vaultStore.listVaults();
      await database.update(vaults).set({
        name: 'Damaged canonical name',
        emoji: 'X',
        targetAmount: '777.99',
        targetDate: '2030-06-01',
        status: 'archived',
      }).where(eq(vaults.id, GENERAL_SAVINGS_VAULT_ID));

      const concurrentLists = await Promise.all([
        vaultStore.listVaults(),
        vaultStore.listVaults(),
        vaultStore.listVaults(),
      ]);
      for (const list of concurrentLists) {
        expect(list).toContainEqual(expect.objectContaining({
          id: GENERAL_SAVINGS_VAULT_ID,
          name: 'General Savings',
          emoji: '💰',
          isGeneral: true,
          targetAmount: '777.99',
          targetDate: '2030-06-01',
          status: 'active',
        }));
      }

      expect(await vaultStore.archiveVault(GENERAL_SAVINGS_VAULT_ID))
        .toEqual({ outcome: 'general_protected' });
      expect(await vaultStore.deleteVault(GENERAL_SAVINGS_VAULT_ID)).toBe('general_protected');
      expect(await vaultStore.updateVault(GENERAL_SAVINGS_VAULT_ID, {
        name: 'Renamed Savings',
        emoji: '💰',
        targetAmount: '777.99',
        targetDate: '2030-06-01',
      })).toEqual({ outcome: 'general_protected' });

      const contribution = await vaultStore.createContribution(
        GENERAL_SAVINGS_VAULT_ID,
        { amount: '0.99' },
      );
      expect(contribution.outcome).toBe('created');
      if (contribution.outcome === 'created') {
        cleanup.add(() => database.delete(vaultContributions)
          .where(eq(vaultContributions.id, contribution.contribution.id)));
      }
    } finally {
      await cleanup.run();
    }
  });

  it('updates Vaults and preserves exact high-precision concurrent contribution aggregates', async () => {
    const { database, vaultStore } = testStores();
    const suffix = randomUUID();
    const cleanup = new CleanupRegistry();

    try {
      const created = await vaultStore.createVault({
        name: `Integration Vault ${suffix}`,
        emoji: 'IV',
        targetAmount: '200.20',
      });
      cleanup.add(() => database.delete(vaults).where(eq(vaults.id, created.id)));
      expect(await vaultStore.updateVault(created.id, {
        name: `Updated Vault ${suffix}`,
        emoji: 'UV',
        targetAmount: '0.01',
      })).toEqual(expect.objectContaining({
        outcome: 'updated',
        vault: expect.objectContaining({
          name: `Updated Vault ${suffix}`,
          emoji: 'UV',
          targetAmount: '0.01',
          isGeneral: false,
        }),
      }));

      const contributions = await settleAndRegister([
        vaultStore.createContribution(created.id, { amount: MAX_MONEY }),
        vaultStore.createContribution(created.id, { amount: MAX_MONEY }),
      ], (contribution) => {
        if (contribution.outcome === 'created') {
          cleanup.add(() => database.delete(vaultContributions)
            .where(eq(vaultContributions.id, contribution.contribution.id)));
        }
      });
      for (const contribution of contributions) {
        expect(contribution.outcome).toBe('created');
      }
      expect(await vaultStore.getVault(created.id)).toEqual(expect.objectContaining({
        savedAmount: '1999999999999999999.98',
        progressPercent: '19999999999999999999800.00',
      }));
    } finally {
      await cleanup.run();
    }
  });

  it('serializes a real Vault delete/contribution race without orphaning data', async () => {
    const { database, vaultStore } = testStores();
    const cleanup = new CleanupRegistry();

    try {
      const created = await vaultStore.createVault({
        name: `Race Vault ${randomUUID()}`,
        emoji: 'RV',
        targetAmount: '10.00',
      });
      cleanup.add(() => database.delete(vaults).where(eq(vaults.id, created.id)));
      const [deletionResult, contributionResult] = await Promise.allSettled([
        vaultStore.deleteVault(created.id),
        vaultStore.createContribution(created.id, { amount: '0.99' }),
      ]);
      if (contributionResult.status === 'fulfilled' && contributionResult.value.outcome === 'created') {
        const contributionId = contributionResult.value.contribution.id;
        cleanup.add(() => database.delete(vaultContributions)
          .where(eq(vaultContributions.id, contributionId)));
      }
      if (deletionResult.status === 'rejected' || contributionResult.status === 'rejected') {
        throw new AggregateError([
          ...(deletionResult.status === 'rejected' ? [deletionResult.reason] : []),
          ...(contributionResult.status === 'rejected' ? [contributionResult.reason] : []),
        ], 'Concurrent Vault race setup failed');
      }
      const deletion = deletionResult.value;
      const contribution = contributionResult.value;
      expect([
        { deletion: 'deleted', contribution: 'not_found' },
        { deletion: 'has_contributions', contribution: 'created' },
      ]).toContainEqual({ deletion, contribution: contribution.outcome });
    } finally {
      await cleanup.run();
    }
  });

  it('composes exact maximum-value Net Worth components through the production store', async () => {
    const { database, netWorth } = testStores();
    const suffix = randomUUID();
    const before = await netWorth.getNetWorth();
    const cleanup = new CleanupRegistry();

    try {
      for (const label of ['A', 'B']) {
        const asset = await netWorth.createAsset({
          name: `Integration max asset ${label} ${suffix}`,
          type: 'cash',
          currentValue: MAX_MONEY,
        });
        cleanup.add(() => database.delete(assets).where(eq(assets.id, asset.id)));
      }
      const after = await netWorth.getNetWorth();
      const PreciseDecimal = Decimal.clone({ precision: 50 });
      expect(new PreciseDecimal(after.manualAssets).minus(before.manualAssets).toFixed(2))
        .toBe('1999999999999999999.98');
      expect(new PreciseDecimal(after.netWorth).minus(before.netWorth).toFixed(2))
        .toBe('1999999999999999999.98');
    } finally {
      await cleanup.run();
    }
  });

  it('keeps foundation records discoverable through the production history aggregate', async () => {
    const { database, budgets, aggregates } = testStores();
    const source = `History income ${randomUUID()}`;
    const cleanup = new CleanupRegistry();
    try {
      const created = await budgets.createIncome({ source, category: 'bonus', amount: '12.34' });
      cleanup.add(() => database.delete(income).where(eq(income.id, created.id)));
      const history = await aggregates.getHistory({ limit: 100, offset: 0, type: 'income' });
      expect(history.items).toContainEqual(expect.objectContaining({
        id: created.id,
        type: 'income',
        source,
        category: 'bonus',
        amount: '12.34',
      }));
    } finally {
      await cleanup.run();
    }
  });

  it('persists liability values without losing cents', async () => {
    const { database, netWorth } = testStores();
    const cleanup = new CleanupRegistry();
    try {
      const created = await netWorth.createLiability({
        name: `Integration liability ${randomUUID()}`,
        type: 'loan',
        outstandingBalance: '25.05',
      });
      cleanup.add(() => database.delete(liabilities).where(eq(liabilities.id, created.id)));
      expect(created.outstandingBalance).toBe('25.05');
    } finally {
      await cleanup.run();
    }
  });
});
