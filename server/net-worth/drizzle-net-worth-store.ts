import Decimal from 'decimal.js';
import { desc, eq, sql } from 'drizzle-orm';

import type {
  AssetRecord,
  AssetType,
  CreateAssetInput,
  CreateLiabilityInput,
  LiabilityRecord,
  LiabilityType,
  NetWorthSummary,
  UpdateAssetInput,
  UpdateLiabilityInput,
} from '../../shared/contracts';
import type { AppDatabase } from '../db/client';
import { assets, liabilities, moneyBorrowed, moneyLent } from '../db/schema';
import type { NetWorthStore } from './store';

interface NetWorthAggregateRow {
  [key: string]: unknown;
  manualAssets: string;
  receivables: string;
  manualLiabilities: string;
  borrowedDebt: string;
}

function assetResult(row: typeof assets.$inferSelect): AssetRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AssetType,
    currentValue: String(row.currentValue),
    ...(row.note !== null ? { note: row.note } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function liabilityResult(row: typeof liabilities.$inferSelect): LiabilityRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type as LiabilityType,
    outstandingBalance: String(row.outstandingBalance),
    ...(row.note !== null ? { note: row.note } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleNetWorthStore implements NetWorthStore {
  constructor(private readonly database: AppDatabase) {}

  async createAsset(input: CreateAssetInput): Promise<AssetRecord> {
    const [row] = await this.database.insert(assets).values(input).returning();
    return assetResult(row);
  }

  async listAssets(): Promise<AssetRecord[]> {
    const rows = await this.database.select().from(assets)
      .orderBy(desc(assets.createdAt), desc(assets.id));
    return rows.map(assetResult);
  }

  async updateAsset(id: string, input: UpdateAssetInput): Promise<AssetRecord | undefined> {
    const [row] = await this.database.update(assets).set({
      ...input,
      note: input.note ?? null,
      updatedAt: sql`now()`,
    }).where(eq(assets.id, id)).returning();
    return row ? assetResult(row) : undefined;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const rows = await this.database.delete(assets).where(eq(assets.id, id))
      .returning({ id: assets.id });
    return rows.length > 0;
  }

  async createLiability(input: CreateLiabilityInput): Promise<LiabilityRecord> {
    const [row] = await this.database.insert(liabilities).values(input).returning();
    return liabilityResult(row);
  }

  async listLiabilities(): Promise<LiabilityRecord[]> {
    const rows = await this.database.select().from(liabilities)
      .orderBy(desc(liabilities.createdAt), desc(liabilities.id));
    return rows.map(liabilityResult);
  }

  async updateLiability(
    id: string,
    input: UpdateLiabilityInput,
  ): Promise<LiabilityRecord | undefined> {
    const [row] = await this.database.update(liabilities).set({
      ...input,
      note: input.note ?? null,
      updatedAt: sql`now()`,
    }).where(eq(liabilities.id, id)).returning();
    return row ? liabilityResult(row) : undefined;
  }

  async deleteLiability(id: string): Promise<boolean> {
    const rows = await this.database.delete(liabilities).where(eq(liabilities.id, id))
      .returning({ id: liabilities.id });
    return rows.length > 0;
  }

  async getNetWorth(): Promise<NetWorthSummary> {
    const result = await this.database.execute<NetWorthAggregateRow>(sql`
      select
        coalesce((select sum(${assets.currentValue}) from ${assets}), 0)::text as "manualAssets",
        coalesce((select sum(${moneyLent.amount}) from ${moneyLent}), 0)::text as "receivables",
        coalesce((select sum(${liabilities.outstandingBalance}) from ${liabilities}), 0)::text as "manualLiabilities",
        coalesce((select sum(${moneyBorrowed.amount}) from ${moneyBorrowed}), 0)::text as "borrowedDebt"
    `);
    const row = result.rows[0];
    if (!row) throw new Error('Net worth aggregate query returned no row');

    const manualAssets = new Decimal(row.manualAssets);
    const receivables = new Decimal(row.receivables);
    const manualLiabilities = new Decimal(row.manualLiabilities);
    const borrowedDebt = new Decimal(row.borrowedDebt);
    const totalOwned = manualAssets.plus(receivables);
    const totalOwed = manualLiabilities.plus(borrowedDebt);
    const netWorth = totalOwned.minus(totalOwed);

    return {
      manualAssets: manualAssets.toFixed(2),
      receivables: receivables.toFixed(2),
      totalOwned: totalOwned.toFixed(2),
      manualLiabilities: manualLiabilities.toFixed(2),
      borrowedDebt: borrowedDebt.toFixed(2),
      totalOwed: totalOwed.toFixed(2),
      netWorth: netWorth.toFixed(2),
      status: netWorth.isZero() ? 'zero' : netWorth.isPositive() ? 'positive' : 'negative',
    };
  }
}
