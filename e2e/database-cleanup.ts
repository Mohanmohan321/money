import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { createDatabase } from '../server/db/client';
import {
  assets,
  income,
  liabilities,
  moneyBorrowed,
  moneyLent,
  subscriptionReviews,
  transactions,
  vaultContributions,
  vaults,
} from '../server/db/schema';

const uuidList = z.array(z.string().uuid()).default([]);
const cleanupTargetsSchema = z.object({
  vaultContributionIds: uuidList,
  subscriptionMerchantKeys: z.array(z.string().trim().min(1).max(200)).default([]),
  vaultIds: uuidList,
  incomeIds: uuidList,
  assetIds: uuidList,
  liabilityIds: uuidList,
  transactionIds: uuidList,
  lendingIds: uuidList,
  borrowingIds: uuidList,
});

export type DatabaseCleanupTargets = z.input<typeof cleanupTargetsSchema>;

function disposableDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('E2E database cleanup refuses to run when NODE_ENV=production');
  }
  if (process.env.TEST_DATABASE_DISPOSABLE !== 'true') {
    throw new Error('TEST_DATABASE_DISPOSABLE=true is required for targeted E2E database cleanup');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for targeted E2E database cleanup');
  return createDatabase(databaseUrl);
}

export async function backdateE2eTransactions(values: Array<{ id: string; createdAt: Date }>): Promise<void> {
  const parsed = z.array(z.object({ id: z.string().uuid(), createdAt: z.date() })).parse(values);
  const database = disposableDatabase();
  for (const value of parsed) {
    await database.update(transactions).set({ createdAt: value.createdAt }).where(eq(transactions.id, value.id));
  }
}

export async function cleanupE2eDatabase(targets: DatabaseCleanupTargets): Promise<void> {
  const database = disposableDatabase();
  const parsed = cleanupTargetsSchema.parse(targets);
  const deletes: Array<PromiseLike<unknown>> = [];
  if (parsed.vaultContributionIds.length) deletes.push(database.delete(vaultContributions).where(inArray(vaultContributions.id, parsed.vaultContributionIds)));
  if (parsed.subscriptionMerchantKeys.length) deletes.push(database.delete(subscriptionReviews).where(inArray(subscriptionReviews.merchantKey, parsed.subscriptionMerchantKeys)));
  await Promise.all(deletes);
  const parentDeletes: Array<PromiseLike<unknown>> = [];
  if (parsed.vaultIds.length) parentDeletes.push(database.delete(vaults).where(inArray(vaults.id, parsed.vaultIds)));
  if (parsed.incomeIds.length) parentDeletes.push(database.delete(income).where(inArray(income.id, parsed.incomeIds)));
  if (parsed.assetIds.length) parentDeletes.push(database.delete(assets).where(inArray(assets.id, parsed.assetIds)));
  if (parsed.liabilityIds.length) parentDeletes.push(database.delete(liabilities).where(inArray(liabilities.id, parsed.liabilityIds)));
  if (parsed.transactionIds.length) parentDeletes.push(database.delete(transactions).where(inArray(transactions.id, parsed.transactionIds)));
  if (parsed.lendingIds.length) parentDeletes.push(database.delete(moneyLent).where(inArray(moneyLent.id, parsed.lendingIds)));
  if (parsed.borrowingIds.length) parentDeletes.push(database.delete(moneyBorrowed).where(inArray(moneyBorrowed.id, parsed.borrowingIds)));
  await Promise.all(parentDeletes);
}
