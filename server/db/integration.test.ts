import { randomUUID } from 'node:crypto';

import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { DrizzleAggregateStore } from '../aggregates/drizzle-aggregate-store';
import { DrizzleSessionStore } from '../auth/drizzle-session-store';
import { hashSessionToken } from '../auth/session';
import { DrizzleBudgetStore } from '../budgets/drizzle-budget-store';
import { DrizzleNetWorthStore } from '../net-worth/drizzle-net-worth-store';
import { DrizzleRecordStore } from '../records/drizzle-record-store';
import { DrizzleVaultStore } from '../vaults/drizzle-vault-store';
import { createDatabase } from './client';
import {
  assets,
  liabilities,
  monthlyBudgets,
  transactions,
  vaultContributions,
  vaults,
} from './schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function testStores() {
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for database integration tests; use a migrated disposable Neon branch',
    );
  }
  const database = createDatabase(testDatabaseUrl);
  return {
    database,
    records: new DrizzleRecordStore(database),
    budgets: new DrizzleBudgetStore(database),
    vaultStore: new DrizzleVaultStore(database),
    netWorth: new DrizzleNetWorthStore(database),
    aggregates: new DrizzleAggregateStore(database),
    sessions: new DrizzleSessionStore(database),
  };
}

describe('Neon PostgreSQL integration', () => {

  it('persists all record types, preserves decimal strings, aggregates them, and enforces constraints', async () => {
    const { database, records, aggregates } = testStores();
    const suffix = randomUUID();
    const description = `Integration transaction ${suffix}`;
    const lender = `Integration lender ${suffix}`;
    const borrower = `Integration borrower ${suffix}`;
    const createdIds: Array<{ type: 'transaction' | 'lent' | 'borrowed'; id: string }> = [];
    const from = new Date(Date.now() - 60_000);
    const toExclusive = new Date(Date.now() + 60_000);

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

      await expect(database.insert(transactions).values({ description: 'Constraint probe', category: 'other', amount: '0.00' }))
        .rejects.toThrow();
    } finally {
      for (const item of createdIds) {
        if (item.type === 'transaction') await records.deleteTransaction(item.id);
        if (item.type === 'lent') await records.deleteLent(item.id);
        if (item.type === 'borrowed') await records.deleteBorrowed(item.id);
      }
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

  it('persists and composes the budgeting foundation with fixed decimal values', async () => {
    const { database, budgets, vaultStore, netWorth, aggregates } = testStores();
    const suffix = randomUUID();
    const created: {
      month?: string;
      incomeId?: string;
      vaultId?: string;
      contributionId?: string;
      assetId?: string;
      liabilityId?: string;
    } = {};

    for (let attempt = 0; attempt < 10 && !created.month; attempt += 1) {
      const candidateSeed = Number.parseInt(randomUUID().slice(0, 8), 16);
      const candidate = `${String(1000 + (candidateSeed % 9000)).padStart(4, '0')}-${String(1 + (candidateSeed % 12)).padStart(2, '0')}`;
      const existing = await database
        .select({ month: monthlyBudgets.month })
        .from(monthlyBudgets)
        .where(eq(monthlyBudgets.month, candidate))
        .limit(1);
      if (existing.length === 0) created.month = candidate;
    }
    if (!created.month) throw new Error('Could not allocate a unique integration-test budget month');

    const beforeNetWorth = await netWorth.getNetWorth();
    try {
      const budget = await budgets.upsertBudget(created.month, {
        salary: '1000.10',
        spendingLimit: '800.80',
        savingsTarget: '200.20',
      });
      expect(budget).toEqual(expect.objectContaining({
        month: created.month,
        salary: '1000.10',
        spendingLimit: '800.80',
        savingsTarget: '200.20',
        source: 'saved',
      }));

      const income = await budgets.createIncome({
        source: `Integration income ${suffix}`,
        category: 'freelance',
        amount: '40.40',
      });
      created.incomeId = income.id;
      expect(income.amount).toBe('40.40');

      const vault = await vaultStore.createVault({
        name: `Integration Vault ${suffix}`,
        emoji: 'IV',
        targetAmount: '200.20',
      });
      created.vaultId = vault.id;
      expect(vault.targetAmount).toBe('200.20');

      const contributionResult = await vaultStore.createContribution(vault.id, { amount: '50.05' });
      expect(contributionResult.outcome).toBe('created');
      if (contributionResult.outcome !== 'created') {
        throw new Error('Integration-test Vault contribution was not created');
      }
      created.contributionId = contributionResult.contribution.id;
      expect(contributionResult.contribution.amount).toBe('50.05');
      expect(await vaultStore.getVault(vault.id)).toEqual(expect.objectContaining({
        savedAmount: '50.05',
        progressPercent: '25.00',
      }));

      const asset = await netWorth.createAsset({
        name: `Integration asset ${suffix}`,
        type: 'cash',
        currentValue: '100.10',
      });
      created.assetId = asset.id;
      expect(asset.currentValue).toBe('100.10');

      const liability = await netWorth.createLiability({
        name: `Integration liability ${suffix}`,
        type: 'loan',
        outstandingBalance: '25.05',
      });
      created.liabilityId = liability.id;
      expect(liability.outstandingBalance).toBe('25.05');

      const history = await aggregates.getHistory({ limit: 100, offset: 0 });
      expect(history.items).toContainEqual(expect.objectContaining({
        id: income.id,
        type: 'income',
        source: `Integration income ${suffix}`,
        category: 'freelance',
        amount: '40.40',
      }));

      const afterNetWorth = await netWorth.getNetWorth();
      expect(new Decimal(afterNetWorth.manualAssets).minus(beforeNetWorth.manualAssets).toFixed(2))
        .toBe('100.10');
      expect(new Decimal(afterNetWorth.manualLiabilities).minus(beforeNetWorth.manualLiabilities).toFixed(2))
        .toBe('25.05');
      expect(new Decimal(afterNetWorth.netWorth).minus(beforeNetWorth.netWorth).toFixed(2))
        .toBe('75.05');
    } finally {
      if (created.contributionId) {
        await database.delete(vaultContributions)
          .where(eq(vaultContributions.id, created.contributionId));
      }
      if (created.vaultId) {
        await database.delete(vaults).where(eq(vaults.id, created.vaultId));
      }
      if (created.incomeId) await budgets.deleteIncome(created.incomeId);
      if (created.assetId) {
        await database.delete(assets).where(eq(assets.id, created.assetId));
      }
      if (created.liabilityId) {
        await database.delete(liabilities).where(eq(liabilities.id, created.liabilityId));
      }
      await database.delete(monthlyBudgets).where(eq(monthlyBudgets.month, created.month));
    }
  });
});
