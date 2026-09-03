import Decimal from 'decimal.js';
import { asc, eq, ne, or, sql } from 'drizzle-orm';

import type {
  CreateVaultContributionInput,
  CreateVaultInput,
  UpdateVaultInput,
  Vault,
  VaultContribution,
} from '../../shared/contracts';
import type { AppDatabase } from '../db/client';
import { vaultContributions, vaults } from '../db/schema';
import type {
  ArchiveVaultResult,
  ContributionResult,
  DeleteVaultResult,
  UpdateVaultResult,
  VaultStore,
} from './store';

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
  id: string;
}

const GENERAL_SAVINGS_VAULT_ID = '00000000-0000-4000-8000-000000000001';
const GENERAL_SAVINGS_NAME = 'General Savings';
const GENERAL_SAVINGS_EMOJI = '💰';

function isForeignKeyViolation(error: unknown): error is { code: '23503' } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === '23503';
}

export function calculateProgressPercent(savedAmount: string, targetAmount: string): string {
  const widestOperand = Math.max(1, ...[savedAmount, targetAmount].map((value) => {
    const significantDigits = value
      .replace(/^[+-]/, '')
      .replace('.', '')
      .replace(/^0+/, '');
    return significantDigits.length;
  }));
  const MoneyDecimal = Decimal.clone({ precision: widestOperand + 4 });
  return new MoneyDecimal(savedAmount).div(targetAmount).mul(100).toFixed(2);
}

function vaultResult(row: VaultAggregateRow): Vault {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    isGeneral: row.id === GENERAL_SAVINGS_VAULT_ID,
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
        savedAmount: sql<string>`coalesce(sum(${vaultContributions.amount}), 0)::text`,
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
        name: GENERAL_SAVINGS_NAME,
        emoji: GENERAL_SAVINGS_EMOJI,
        targetAmount: '1.00',
      })
      .onConflictDoUpdate({
        target: vaults.id,
        set: {
          name: GENERAL_SAVINGS_NAME,
          emoji: GENERAL_SAVINGS_EMOJI,
          status: 'active',
          updatedAt: sql`now()`,
        },
        setWhere: or(
          ne(vaults.name, GENERAL_SAVINGS_NAME),
          ne(vaults.emoji, GENERAL_SAVINGS_EMOJI),
          ne(vaults.status, 'active'),
        ),
      });
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

  async updateVault(id: string, input: UpdateVaultInput): Promise<UpdateVaultResult> {
    if (
      id === GENERAL_SAVINGS_VAULT_ID
      && (input.name !== GENERAL_SAVINGS_NAME || input.emoji !== GENERAL_SAVINGS_EMOJI)
    ) {
      return { outcome: 'general_protected' };
    }
    const rows = await this.database
      .update(vaults)
      .set({
        ...input,
        targetDate: input.targetDate ?? null,
        updatedAt: sql`now()`,
      })
      .where(eq(vaults.id, id))
      .returning({ id: vaults.id });
    if (rows.length === 0) return { outcome: 'not_found' };
    const vault = await this.getVault(id);
    if (!vault) throw new Error('Updated Vault could not be read');
    return { outcome: 'updated', vault };
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

  async archiveVault(id: string): Promise<ArchiveVaultResult> {
    if (id === GENERAL_SAVINGS_VAULT_ID) return { outcome: 'general_protected' };
    const rows = await this.database
      .update(vaults)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(eq(vaults.id, id))
      .returning({ id: vaults.id });
    if (rows.length === 0) return { outcome: 'not_found' };
    const vault = await this.getVault(id);
    if (!vault) throw new Error('Archived Vault could not be read');
    return { outcome: 'archived', vault };
  }

  async deleteVault(id: string): Promise<DeleteVaultResult | 'general_protected'> {
    if (id === GENERAL_SAVINGS_VAULT_ID) return 'general_protected';
    try {
      const result = await this.database.execute<DeleteStatementRow>(sql`
        delete from ${vaults}
        where ${vaults.id} = ${id}
        returning ${vaults.id}
      `);
      return result.rows.length > 0 ? 'deleted' : 'not_found';
    } catch (error) {
      if (isForeignKeyViolation(error)) return 'has_contributions';
      throw error;
    }
  }
}
