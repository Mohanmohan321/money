import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { neon } from '@neondatabase/serverless';
import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAggregateStore } from '../aggregates/drizzle-aggregate-store';
import { DrizzleSessionStore } from '../auth/drizzle-session-store';
import { hashSessionToken } from '../auth/session';
import { DrizzleBudgetStore } from '../budgets/drizzle-budget-store';
import { DrizzleNetWorthStore } from '../net-worth/drizzle-net-worth-store';
import { DrizzleRecordStore } from '../records/drizzle-record-store';
import { DrizzleVaultStore } from '../vaults/drizzle-vault-store';
import { createDatabase, type AppDatabase } from './client';
import {
  assets,
  income,
  liabilities,
  monthlyBudgets,
  transactions,
  vaultContributions,
  vaults,
} from './schema';

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
  aggregates: DrizzleAggregateStore;
  sessions: DrizzleSessionStore;
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

async function runCleanup(steps: Array<() => Promise<unknown>>): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Disposable database integration cleanup failed');
  }
}

function cleanupIfDefined<T>(
  value: T | undefined,
  step: (definedValue: T) => Promise<unknown>,
): Array<() => Promise<unknown>> {
  return value === undefined ? [] : [() => step(value)];
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
    aggregates: new DrizzleAggregateStore(database),
    sessions: new DrizzleSessionStore(database),
  };
}, 120_000);

describe.sequential('disposable Neon PostgreSQL integration', () => {
  it('applies the production migrations to a legacy schema and verifies the category backfill', async () => {
    const databaseUrl = requireDisposableDatabaseUrl();
    const sqlClient = neon(databaseUrl);
    const isolatedSchema = `budgeting_migration_${randomUUID().replaceAll('-', '')}`;
    const legacyDescription = `Legacy transaction ${randomUUID()}`;
    const migration0 = await readFile(resolve(process.cwd(), 'drizzle/0000_robust_anita_blake.sql'), 'utf8');
    const migration1 = await readFile(resolve(process.cwd(), 'drizzle/0001_budgeting_foundation.sql'), 'utf8');
    const isolatedMigration1 = migration1.replaceAll(
      '"public"."vaults"',
      `"${isolatedSchema}"."vaults"`,
    );

    await sqlClient.query(`create schema "${isolatedSchema}"`);
    try {
      await sqlClient.transaction((transaction) => [
        transaction.query(`set local search_path to "${isolatedSchema}"`),
        ...splitMigration(migration0).map((statement) => transaction.query(statement)),
        transaction.query(
          'insert into transactions (description, amount) values ($1, $2)',
          [legacyDescription, '10.10'],
        ),
        ...splitMigration(isolatedMigration1).map((statement) => transaction.query(statement)),
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

      await expect(sqlClient.query(
        `insert into "${isolatedSchema}".income (source, category, amount)
         values ($1, $2, $3)`,
        ['Constraint probe', 'other', '0.00'],
      )).rejects.toThrow();
    } finally {
      await sqlClient.query(`drop schema if exists "${isolatedSchema}" cascade`);
    }
  });

  it('persists all record types, preserves decimal strings, aggregates them, and enforces constraints', async () => {
    const { database, records, aggregates } = testStores();
    const suffix = randomUUID();
    const description = `Integration transaction ${suffix}`;
    const lender = `Integration lender ${suffix}`;
    const borrower = `Integration borrower ${suffix}`;
    const createdIds: Array<{ type: 'transaction' | 'lent' | 'borrowed'; id: string }> = [];
    const from = new Date(Date.now() - 5 * 60_000);
    const toExclusive = new Date(Date.now() + 5 * 60_000);

    try {
      const transaction = await records.createTransaction({ description, amount: '10.10' });
      const lent = await records.createLent({ personName: lender, amount: '20.20' });
      const borrowed = await records.createBorrowed({ personName: borrower, amount: '30.30' });
      createdIds.push(
        { type: 'transaction', id: transaction.id },
        { type: 'lent', id: lent.id },
        { type: 'borrowed', id: borrowed.id },
      );

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

      await expect(database.insert(transactions).values({
        description: `Constraint probe ${suffix}`,
        category: 'other',
        amount: '0.00',
      })).rejects.toThrow();
    } finally {
      await runCleanup([...createdIds].reverse().map((item) => async () => {
        if (item.type === 'transaction') await records.deleteTransaction(item.id);
        if (item.type === 'lent') await records.deleteLent(item.id);
        if (item.type === 'borrowed') await records.deleteBorrowed(item.id);
      }));
    }
  });

  it('persists only a session digest and revokes it', async () => {
    const { sessions } = testStores();
    const token = `integration-${randomUUID()}`;
    const digest = hashSessionToken(token);
    await sessions.create(digest, new Date(Date.now() + 60_000));
    try {
      expect(await sessions.isValid(digest, new Date())).toBe(true);
      expect(await sessions.isValid(hashSessionToken(token), new Date())).toBe(true);
    } finally {
      await sessions.delete(digest);
    }
    expect(await sessions.isValid(digest, new Date())).toBe(false);
  });

  it('carries budgets forward and updates income through the production store', async () => {
    const { database, budgets } = testStores();
    const suffix = randomUUID();
    const [savedMonth, suggestedMonth] = await allocateBudgetMonths(database);
    let incomeId: string | undefined;

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
      incomeId = created.id;
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
      await runCleanup([
        ...cleanupIfDefined(incomeId, (id) => budgets.deleteIncome(id)),
        () => database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, savedMonth)),
        () => database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, suggestedMonth)),
      ]);
    }
  });

  it('protects and repairs General Savings while preserving its financial settings', async () => {
    const { database, vaultStore } = testStores();
    const canonicalBefore = await vaultStore.getVault(GENERAL_SAVINGS_VAULT_ID);
    let contributionId: string | undefined;

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
      if (contribution.outcome === 'created') contributionId = contribution.contribution.id;
    } finally {
      await runCleanup([
        ...cleanupIfDefined(contributionId, (id) => database.delete(vaultContributions)
          .where(eq(vaultContributions.id, id))),
        canonicalBefore
          ? () => database.update(vaults).set({
            name: canonicalBefore.name,
            emoji: canonicalBefore.emoji,
            targetAmount: canonicalBefore.targetAmount,
            targetDate: canonicalBefore.targetDate ?? null,
            status: canonicalBefore.status,
          }).where(eq(vaults.id, GENERAL_SAVINGS_VAULT_ID))
          : () => database.delete(vaults).where(eq(vaults.id, GENERAL_SAVINGS_VAULT_ID)),
      ]);
    }
  });

  it('updates Vaults and preserves exact high-precision concurrent contribution aggregates', async () => {
    const { database, vaultStore } = testStores();
    const suffix = randomUUID();
    let vaultId: string | undefined;
    const contributionIds: string[] = [];

    try {
      const created = await vaultStore.createVault({
        name: `Integration Vault ${suffix}`,
        emoji: 'IV',
        targetAmount: '200.20',
      });
      vaultId = created.id;
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

      const contributions = await Promise.all([
        vaultStore.createContribution(created.id, { amount: MAX_MONEY }),
        vaultStore.createContribution(created.id, { amount: MAX_MONEY }),
      ]);
      for (const contribution of contributions) {
        expect(contribution.outcome).toBe('created');
        if (contribution.outcome === 'created') contributionIds.push(contribution.contribution.id);
      }
      expect(await vaultStore.getVault(created.id)).toEqual(expect.objectContaining({
        savedAmount: '1999999999999999999.98',
        progressPercent: '19999999999999999999800.00',
      }));
    } finally {
      await runCleanup([
        ...contributionIds.map((id) => () => database.delete(vaultContributions)
          .where(eq(vaultContributions.id, id))),
        ...cleanupIfDefined(vaultId, (id) => database.delete(vaults).where(eq(vaults.id, id))),
      ]);
    }
  });

  it('serializes a real Vault delete/contribution race without orphaning data', async () => {
    const { database, vaultStore } = testStores();
    const created = await vaultStore.createVault({
      name: `Race Vault ${randomUUID()}`,
      emoji: 'RV',
      targetAmount: '10.00',
    });
    let contributionId: string | undefined;

    try {
      const [deletion, contribution] = await Promise.all([
        vaultStore.deleteVault(created.id),
        vaultStore.createContribution(created.id, { amount: '0.99' }),
      ]);
      if (contribution.outcome === 'created') contributionId = contribution.contribution.id;
      expect([
        { deletion: 'deleted', contribution: 'not_found' },
        { deletion: 'has_contributions', contribution: 'created' },
      ]).toContainEqual({ deletion, contribution: contribution.outcome });
    } finally {
      await runCleanup([
        ...cleanupIfDefined(contributionId, (id) => database.delete(vaultContributions)
          .where(eq(vaultContributions.id, id))),
        () => database.delete(vaults).where(eq(vaults.id, created.id)),
      ]);
    }
  });

  it('composes exact maximum-value Net Worth components through the production store', async () => {
    const { database, netWorth } = testStores();
    const suffix = randomUUID();
    const before = await netWorth.getNetWorth();
    const assetIds: string[] = [];

    try {
      for (const label of ['A', 'B']) {
        const asset = await netWorth.createAsset({
          name: `Integration max asset ${label} ${suffix}`,
          type: 'cash',
          currentValue: MAX_MONEY,
        });
        assetIds.push(asset.id);
      }
      const after = await netWorth.getNetWorth();
      const PreciseDecimal = Decimal.clone({ precision: 50 });
      expect(new PreciseDecimal(after.manualAssets).minus(before.manualAssets).toFixed(2))
        .toBe('1999999999999999999.98');
      expect(new PreciseDecimal(after.netWorth).minus(before.netWorth).toFixed(2))
        .toBe('1999999999999999999.98');
    } finally {
      await runCleanup(assetIds.map((id) => () => database.delete(assets).where(eq(assets.id, id))));
    }
  });

  it('keeps foundation records discoverable through the production history aggregate', async () => {
    const { database, budgets, aggregates } = testStores();
    const source = `History income ${randomUUID()}`;
    const created = await budgets.createIncome({ source, category: 'bonus', amount: '12.34' });
    try {
      const history = await aggregates.getHistory({ limit: 100, offset: 0, type: 'income' });
      expect(history.items).toContainEqual(expect.objectContaining({
        id: created.id,
        type: 'income',
        source,
        category: 'bonus',
        amount: '12.34',
      }));
    } finally {
      await database.delete(income).where(eq(income.id, created.id));
    }
  });

  it('persists liability values without losing cents', async () => {
    const { database, netWorth } = testStores();
    const created = await netWorth.createLiability({
      name: `Integration liability ${randomUUID()}`,
      type: 'loan',
      outstandingBalance: '25.05',
    });
    try {
      expect(created.outstandingBalance).toBe('25.05');
    } finally {
      await database.delete(liabilities).where(eq(liabilities.id, created.id));
    }
  });
});
