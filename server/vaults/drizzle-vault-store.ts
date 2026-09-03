import Decimal from 'decimal.js';
import { asc, eq, sql } from 'drizzle-orm';

import type {
  CreateVaultContributionInput,
  CreateVaultInput,
  Vault,
  VaultContribution,
} from '../../shared/contracts';
import type { AppDatabase } from '../db/client';
import { vaultContributions, vaults } from '../db/schema';
import type { ContributionResult, DeleteVaultResult, VaultStore } from './store';

interface VaultAggregateRow {
  id: string;
  name: string;
  emoji: string;
  targetAmount: string;
  targetDate: string | null;
  status: string;
  savedAmount: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ContributionStatementRow {
  [key: string]: unknown;
  targetStatus: string;
  id: string | null;
  vaultId: string | null;
  amount: string | null;
  createdAt: Date | string | null;
}

interface DeleteStatementRow {
  [key: string]: unknown;
  outcome: DeleteVaultResult;
}

const GENERAL_SAVINGS_VAULT_ID = '00000000-0000-4000-8000-000000000001';

export function calculateProgressPercent(savedAmount: string, targetAmount: string): string {
  return new Decimal(savedAmount).div(targetAmount).mul(100).toFixed(2);
}

function vaultResult(row: VaultAggregateRow): Vault {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    targetAmount: String(row.targetAmount),
    ...(row.targetDate ? { targetDate: row.targetDate } : {}),
    status: row.status as Vault['status'],
    savedAmount: String(row.savedAmount),
    progressPercent: calculateProgressPercent(String(row.savedAmount), String(row.targetAmount)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function newVaultResult(row: typeof vaults.$inferSelect): Vault {
  return vaultResult({ ...row, savedAmount: '0.00' });
}

export class DrizzleVaultStore implements VaultStore {
  constructor(private readonly database: AppDatabase) {}

  private aggregateQuery() {
    return this.database
      .select({
        id: vaults.id,
        name: vaults.name,
        emoji: vaults.emoji,
        targetAmount: vaults.targetAmount,
        targetDate: vaults.targetDate,
        status: vaults.status,
        savedAmount: sql<string>`coalesce(sum(${vaultContributions.amount}), 0)::numeric(20, 2)`,
        createdAt: vaults.createdAt,
        updatedAt: vaults.updatedAt,
      })
      .from(vaults)
      .leftJoin(vaultContributions, eq(vaultContributions.vaultId, vaults.id))
      .groupBy(
        vaults.id,
        vaults.name,
        vaults.emoji,
        vaults.targetAmount,
        vaults.targetDate,
        vaults.status,
        vaults.createdAt,
        vaults.updatedAt,
      );
  }

  async listVaults(): Promise<Vault[]> {
    await this.database
      .insert(vaults)
      .values({
        id: GENERAL_SAVINGS_VAULT_ID,
        name: 'General Savings',
        emoji: '💰',
        targetAmount: '1.00',
      })
      .onConflictDoNothing({ target: vaults.id });
    const rows = await this.aggregateQuery().orderBy(asc(vaults.createdAt), asc(vaults.id));
    return rows.map(vaultResult);
  }

  async createVault(input: CreateVaultInput): Promise<Vault> {
    const [row] = await this.database.insert(vaults).values(input).returning();
    return newVaultResult(row);
  }

  async getVault(id: string): Promise<Vault | undefined> {
    const [row] = await this.aggregateQuery().where(eq(vaults.id, id)).limit(1);
    return row ? vaultResult(row) : undefined;
  }

  async createContribution(
    vaultId: string,
    input: CreateVaultContributionInput,
  ): Promise<ContributionResult> {
    const result = await this.database.execute<ContributionStatementRow>(sql`
      with target as (
        select ${vaults.id} as id, ${vaults.status} as status
        from ${vaults}
        where ${vaults.id} = ${vaultId}
        for update
      ),
      inserted as (
        insert into ${vaultContributions} (vault_id, amount)
        select target.id, ${input.amount}
        from target
        where target.status = 'active'
        returning
          ${vaultContributions.id} as id,
          ${vaultContributions.vaultId} as "vaultId",
          ${vaultContributions.amount} as amount,
          ${vaultContributions.createdAt} as "createdAt"
      )
      select
        target.status as "targetStatus",
        inserted.id,
        inserted."vaultId",
        inserted.amount,
        inserted."createdAt"
      from target
      left join inserted on true
    `);
    const row = result.rows[0];
    if (!row) return { outcome: 'not_found' };
    if (row.targetStatus !== 'active') return { outcome: 'archived' };
    if (!row.id || !row.vaultId || row.amount === null || row.createdAt === null) {
      throw new Error('Active Vault contribution was not inserted');
    }
    const contribution: VaultContribution = {
      id: row.id,
      vaultId: row.vaultId,
      amount: String(row.amount),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    };
    return { outcome: 'created', contribution };
  }

  async archiveVault(id: string): Promise<Vault | undefined> {
    const rows = await this.database
      .update(vaults)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(eq(vaults.id, id))
      .returning({ id: vaults.id });
    return rows.length > 0 ? this.getVault(id) : undefined;
  }

  async deleteVault(id: string): Promise<DeleteVaultResult> {
    const result = await this.database.execute<DeleteStatementRow>(sql`
      with target as (
        select ${vaults.id} as id
        from ${vaults}
        where ${vaults.id} = ${id}
        for update
      ),
      contribution_state as (
        select exists (
          select 1
          from ${vaultContributions}
          inner join target on target.id = ${vaultContributions.vaultId}
        ) as has_contributions
      ),
      deleted as (
        delete from ${vaults}
        where ${vaults.id} in (select target.id from target)
          and not (select contribution_state.has_contributions from contribution_state)
        returning ${vaults.id}
      )
      select case
        when not exists (select 1 from target) then 'not_found'
        when (select contribution_state.has_contributions from contribution_state)
          then 'has_contributions'
        when exists (select 1 from deleted) then 'deleted'
        else 'not_found'
      end as outcome
    `);
    const outcome = result.rows[0]?.outcome;
    if (
      outcome !== 'not_found'
      && outcome !== 'has_contributions'
      && outcome !== 'deleted'
    ) {
      throw new Error('Vault deletion did not return a valid outcome');
    }
    return outcome;
  }
}
