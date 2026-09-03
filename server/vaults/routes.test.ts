import Decimal from 'decimal.js';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createVaultContributionSchema,
  createVaultSchema,
  updateVaultSchema,
  type CreateVaultContributionInput,
  type CreateVaultInput,
  type UpdateVaultInput,
  type Vault,
  type VaultContribution,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import type { AppDatabase } from '../db/client';
import { calculateProgressPercent, DrizzleVaultStore } from './drizzle-vault-store';
import { createVaultRouter } from './routes';
import type {
  ArchiveVaultResult,
  ContributionResult,
  DeleteVaultResult,
  UpdateVaultResult,
  VaultStore,
} from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

class MemoryVaultStore implements VaultStore {
  readonly vaults = new Map<string, Vault>();
  readonly contributions = new Map<string, VaultContribution[]>();
  private nextId = 100;

  private id(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  private withProgress(vault: Vault): Vault {
    const savedAmount = (this.contributions.get(vault.id) ?? [])
      .reduce((sum, contribution) => sum.plus(contribution.amount), new Decimal(0))
      .toFixed(2);
    return {
      ...vault,
      savedAmount,
      progressPercent: new Decimal(savedAmount).div(vault.targetAmount).mul(100).toFixed(2),
    };
  }

  async listVaults(): Promise<Vault[]> {
    const canonicalId = '00000000-0000-4000-8000-000000000001';
    if (!this.vaults.has(canonicalId)) {
      const now = '2026-09-03T08:00:00.000Z';
      this.vaults.set(canonicalId, {
        id: canonicalId,
        name: 'General Savings',
        emoji: '💰',
        isGeneral: true,
        targetAmount: '1.00',
        status: 'active',
        savedAmount: '0.00',
        progressPercent: '0.00',
        createdAt: now,
        updatedAt: now,
      });
    }
    return [...this.vaults.values()].map((vault) => this.withProgress(vault));
  }

  async createVault(input: CreateVaultInput): Promise<Vault> {
    const now = '2026-09-03T08:00:00.000Z';
    const vault: Vault = {
      id: this.id(),
      ...input,
      isGeneral: false,
      status: 'active',
      savedAmount: '0.00',
      progressPercent: '0.00',
      createdAt: now,
      updatedAt: now,
    };
    this.vaults.set(vault.id, vault);
    return vault;
  }

  async getVault(id: string): Promise<Vault | undefined> {
    const vault = this.vaults.get(id);
    return vault ? this.withProgress(vault) : undefined;
  }

  async updateVault(id: string, input: UpdateVaultInput): Promise<UpdateVaultResult> {
    const vault = this.vaults.get(id);
    if (!vault) return { outcome: 'not_found' };
    if (vault.isGeneral && (input.name !== 'General Savings' || input.emoji !== '💰')) {
      return { outcome: 'general_protected' };
    }
    const { targetDate: _oldTargetDate, ...withoutTargetDate } = vault;
    const updated: Vault = {
      ...withoutTargetDate,
      ...input,
      updatedAt: '2026-09-03T09:30:00.000Z',
    };
    this.vaults.set(id, updated);
    return { outcome: 'updated', vault: this.withProgress(updated) };
  }

  async createContribution(
    vaultId: string,
    input: CreateVaultContributionInput,
  ): Promise<ContributionResult> {
    const vault = this.vaults.get(vaultId);
    if (!vault) return { outcome: 'not_found' };
    if (vault.status === 'archived') return { outcome: 'archived' };

    const contribution: VaultContribution = {
      id: this.id(),
      vaultId,
      amount: input.amount,
      createdAt: '2026-09-03T09:00:00.000Z',
    };
    this.contributions.set(vaultId, [...(this.contributions.get(vaultId) ?? []), contribution]);
    return { outcome: 'created', contribution };
  }

  async archiveVault(id: string): Promise<ArchiveVaultResult> {
    const vault = this.vaults.get(id);
    if (!vault) return { outcome: 'not_found' };
    if (vault.isGeneral) return { outcome: 'general_protected' };
    const archived: Vault = {
      ...vault,
      status: 'archived',
      updatedAt: '2026-09-03T10:00:00.000Z',
    };
    this.vaults.set(id, archived);
    return { outcome: 'archived', vault: this.withProgress(archived) };
  }

  async deleteVault(id: string): Promise<DeleteVaultResult | 'general_protected'> {
    if (!this.vaults.has(id)) return 'not_found';
    if (this.vaults.get(id)?.isGeneral) return 'general_protected';
    if ((this.contributions.get(id) ?? []).length > 0) return 'has_contributions';
    this.vaults.delete(id);
    return 'deleted';
  }
}

const config: AppConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgresql://unused',
  appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters',
  timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173',
  port: 3001,
};

describe('Vault contracts', () => {
  it('normalizes a Vault and contribution while stripping generated fields', () => {
    expect(createVaultSchema.parse({
      name: ' New phone ',
      emoji: ' 📱 ',
      targetAmount: '80000',
      targetDate: '2027-01-15',
      status: 'archived',
    })).toEqual({
      name: 'New phone',
      emoji: '📱',
      targetAmount: '80000.00',
      targetDate: '2027-01-15',
    });
    expect(createVaultContributionSchema.parse({ amount: '25' })).toEqual({ amount: '25.00' });
    expect(updateVaultSchema.parse({
      name: ' Trip ', emoji: ' ✈️ ', targetAmount: '90000', targetDate: '2027-04-01',
      status: 'archived', isGeneral: true,
    })).toEqual({
      name: 'Trip', emoji: '✈️', targetAmount: '90000.00', targetDate: '2027-04-01',
    });
  });

  it.each([
    { name: '', emoji: '📱', targetAmount: '1' },
    { name: 'n'.repeat(81), emoji: '📱', targetAmount: '1' },
    { name: 'Phone', emoji: '', targetAmount: '1' },
    { name: 'Phone', emoji: 'e'.repeat(17), targetAmount: '1' },
    { name: 'Phone', emoji: '📱', targetAmount: '0' },
    { name: 'Phone', emoji: '📱', targetAmount: '1', targetDate: '2027-02-30' },
  ])('rejects invalid Vault input %#', (input) => {
    expect(() => createVaultSchema.parse(input)).toThrow();
  });
});

describe('Drizzle Vault concurrency guards', () => {
  const canonicalId = '00000000-0000-4000-8000-000000000001';
  const now = new Date('2026-09-03T08:00:00.000Z');

  it('repairs one canonical General Savings identity concurrently without overwriting its target', async () => {
    const rows = [
      {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'General Savings',
        emoji: '🏦',
        targetAmount: '500.00',
        targetDate: null,
        status: 'active',
        savedAmount: '0.00',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: canonicalId,
        name: 'Renamed by an older client',
        emoji: '❌',
        targetAmount: '777.99',
        targetDate: '2030-06-01',
        status: 'archived',
        savedAmount: '0.00',
        createdAt: now,
        updatedAt: now,
      },
    ];
    const repairedFields: string[][] = [];
    const database = {
      insert: () => ({
        values: (value: { id: string; name: string; emoji: string; targetAmount: string }) => ({
          onConflictDoUpdate: async (configuration: { set: Record<string, unknown> }) => {
            repairedFields.push(Object.keys(configuration.set).sort());
            const existing = rows.find((row) => row.id === value.id);
            if (existing) {
              existing.name = value.name;
              existing.emoji = value.emoji;
              existing.status = 'active';
            } else {
              rows.push({
                ...value,
                targetDate: null,
                status: 'active',
                savedAmount: '0.00',
                createdAt: now,
                updatedAt: now,
              });
            }
          },
        }),
      }),
      select: () => {
        const query = {
          from: () => query,
          leftJoin: () => query,
          groupBy: () => query,
          orderBy: async () => rows,
        };
        return query;
      },
    } as unknown as AppDatabase;
    const store = new DrizzleVaultStore(database);

    const lists = await Promise.all([store.listVaults(), store.listVaults()]);

    for (const list of lists) {
      expect(list.map((vault) => [
        vault.id,
        vault.name,
        vault.emoji,
        vault.status,
        vault.targetAmount,
        vault.targetDate,
        vault.isGeneral,
      ])).toEqual([
        ['00000000-0000-4000-8000-000000000002', 'General Savings', '🏦', 'active', '500.00', undefined, false],
        [canonicalId, 'General Savings', '💰', 'active', '777.99', '2030-06-01', true],
      ]);
    }
    expect(rows.filter((row) => row.id === canonicalId)).toHaveLength(1);
    expect(repairedFields).toEqual([
      ['emoji', 'name', 'status', 'updatedAt'],
      ['emoji', 'name', 'status', 'updatedAt'],
    ]);
  });

  it('returns aggregate savings as text and preserves maximum-value progress exactly', async () => {
    const aggregateOfTwoMaximumContributions = '1999999999999999999.98';
    let emittedAggregateSql = '';
    const row = {
      id: '00000000-0000-4000-8000-000000000099',
      name: 'Precision Vault',
      emoji: '🎯',
      targetAmount: '0.01',
      targetDate: null,
      status: 'active',
      savedAmount: aggregateOfTwoMaximumContributions,
      createdAt: now,
      updatedAt: now,
    };
    const database = {
      select: (selection: Record<string, unknown>) => {
        emittedAggregateSql = new PgDialect()
          .sqlToQuery(selection.savedAmount as SQL)
          .sql
          .toLowerCase();
        if (/::numeric\(20,\s*2\)/.test(emittedAggregateSql)) {
          throw Object.assign(new Error('numeric field overflow'), { code: '22003' });
        }
        const query = {
          from: () => query,
          leftJoin: () => query,
          groupBy: () => query,
          where: () => query,
          limit: async () => [row],
        };
        return query;
      },
    } as unknown as AppDatabase;

    const result = await new DrizzleVaultStore(database).getVault(row.id);

    expect(emittedAggregateSql).toContain('::text');
    expect(result).toEqual({
      ...row,
      isGeneral: false,
      targetDate: undefined,
      savedAmount: aggregateOfTwoMaximumContributions,
      progressPercent: '19999999999999999999800.00',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('uses scoped precision for a maximum aggregate against the smallest valid target', () => {
    expect(calculateProgressPercent('1999999999999999999.98', '0.01'))
      .toBe('19999999999999999999800.00');
  });

  it('updates user Vault fields through Drizzle and clears an omitted target date', async () => {
    const id = '00000000-0000-4000-8000-000000000099';
    const captured: Record<string, unknown>[] = [];
    const row = {
      id,
      name: 'Updated goal',
      emoji: '🎯',
      targetAmount: '125.50',
      targetDate: null,
      status: 'active',
      savedAmount: '25.10',
      createdAt: now,
      updatedAt: now,
    };
    const database = {
      update: () => ({
        set: (values: Record<string, unknown>) => {
          captured.push(values);
          return { where: () => ({ returning: async () => [{ id }] }) };
        },
      }),
      select: () => {
        const query = {
          from: () => query,
          leftJoin: () => query,
          groupBy: () => query,
          where: () => query,
          limit: async () => [row],
        };
        return query;
      },
    } as unknown as AppDatabase;

    const result = await new DrizzleVaultStore(database).updateVault(id, {
      name: row.name,
      emoji: row.emoji,
      targetAmount: row.targetAmount,
    });

    expect(captured).toEqual([expect.objectContaining({
      name: 'Updated goal',
      emoji: '🎯',
      targetAmount: '125.50',
      targetDate: null,
      updatedAt: expect.anything(),
    })]);
    expect(captured[0]).not.toHaveProperty('status');
    expect(result).toEqual({
      outcome: 'updated',
      vault: {
        ...row,
        isGeneral: false,
        targetDate: undefined,
        progressPercent: '20.00',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  });

  it('protects the canonical Vault in production storage before issuing writes', async () => {
    const database = {
      execute: vi.fn(),
      update: vi.fn(),
    } as unknown as AppDatabase;
    const store = new DrizzleVaultStore(database);

    await expect(store.archiveVault(canonicalId)).resolves.toEqual({
      outcome: 'general_protected',
    });
    await expect(store.deleteVault(canonicalId)).resolves.toBe('general_protected');
    await expect(store.updateVault(canonicalId, {
      name: 'Renamed', emoji: '❌', targetAmount: '10.00',
    })).resolves.toEqual({ outcome: 'general_protected' });
    expect(database.update).not.toHaveBeenCalled();
    expect(database.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['no row', [], 'not_found'],
    ['one returned row', [{ id: '00000000-0000-4000-8000-000000000099' }], 'deleted'],
  ] as const)('maps %s from atomic DELETE RETURNING', async (_case, rows, expected) => {
    const statements: SQL[] = [];
    const database = {
      execute: async (statement: SQL) => {
        statements.push(statement);
        return { rows };
      },
    } as unknown as AppDatabase;

    const result = await new DrizzleVaultStore(database).deleteVault(
      '00000000-0000-4000-8000-000000000099',
    );

    expect(result).toBe(expected);
    expect(statements).toHaveLength(1);
    const emittedSql = new PgDialect().sqlToQuery(statements[0]).sql.toLowerCase();
    expect(emittedSql).toContain('delete from');
    expect(emittedSql).toContain('returning');
  });

  it('maps only PostgreSQL foreign-key violations to the funded Vault outcome and 409', async () => {
    const database = {
      execute: async () => {
        throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
      },
    } as unknown as AppDatabase;
    const protectedRouter = Router();
    protectedRouter.use(createVaultRouter(new DrizzleVaultStore(database)));
    const agent = request.agent(createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter,
    }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);

    const response = await agent
      .delete('/api/vaults/00000000-0000-4000-8000-000000000099')
      .expect(409);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'VAULT_HAS_CONTRIBUTIONS',
        message: 'Vaults with contributions must be archived instead of deleted',
      },
    });
  });

  it('propagates non-foreign-key database errors to the sanitized 500 response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = {
      execute: async () => {
        throw Object.assign(new Error('serialization failure with private details'), {
          code: '40001',
        });
      },
    } as unknown as AppDatabase;
    const protectedRouter = Router();
    protectedRouter.use(createVaultRouter(new DrizzleVaultStore(database)));
    const agent = request.agent(createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter,
    }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);

    const response = await agent
      .delete('/api/vaults/00000000-0000-4000-8000-000000000099')
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });
});

describe('Vault APIs', () => {
  let store: MemoryVaultStore;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryVaultStore();
    const protectedRouter = Router();
    protectedRouter.use(createVaultRouter(store));
    agent = request.agent(createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter,
    }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('creates General Savings lazily when no Vault exists', async () => {
    const response = await agent.get('/api/vaults').expect(200);

    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        name: 'General Savings',
        emoji: '💰',
        isGeneral: true,
        targetAmount: '1.00',
        savedAmount: '0.00',
        progressPercent: '0.00',
        status: 'active',
      }),
    ]);
  });

  it('creates General Savings when named goals exist but the built-in Vault does not', async () => {
    await agent.post('/api/vaults').send({
      name: 'Emergency Fund', emoji: '🛟', targetAmount: '100000',
    }).expect(201);

    const response = await agent.get('/api/vaults').expect(200);

    expect(response.body.data.items.map((vault: Vault) => vault.name)).toEqual([
      'Emergency Fund',
      'General Savings',
    ]);
  });

  it('adds a contribution and returns Decimal progress', async () => {
    const created = await agent.post('/api/vaults').send({
      name: 'New phone', emoji: '📱', targetAmount: '80000', targetDate: '2027-01-15',
    }).expect(201);
    const id = created.body.data.id;
    await agent.post(`/api/vaults/${id}/contributions`).send({ amount: '20000' }).expect(201);
    const list = await agent.get('/api/vaults').expect(200);
    expect(list.body.data.items[0]).toEqual(expect.objectContaining({
      savedAmount: '20000.00', progressPercent: '25.00', status: 'active',
    }));
  });

  it('does not clamp overfunded progress to 100 percent', () => {
    expect(calculateProgressPercent('125.00', '100.00')).toBe('125.00');
  });

  it('archives a funded Vault instead of deleting it', async () => {
    const funded = await agent.post('/api/vaults').send({
      name: 'Trip', emoji: '✈️', targetAmount: '50000',
    }).expect(201);
    const fundedVaultId = funded.body.data.id;
    await agent.post(`/api/vaults/${fundedVaultId}/contributions`).send({ amount: '1000' }).expect(201);

    await agent.delete(`/api/vaults/${fundedVaultId}`).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('VAULT_HAS_CONTRIBUTIONS'));
    const archived = await agent.post(`/api/vaults/${fundedVaultId}/archive`).expect(200);

    expect(archived.body.data).toEqual(expect.objectContaining({
      id: fundedVaultId,
      status: 'archived',
      savedAmount: '1000.00',
    }));
  });

  it('supports lookup and hard deletion of an unfunded Vault', async () => {
    const created = await agent.post('/api/vaults').send({
      name: 'Laptop', emoji: '💻', targetAmount: '100000',
    }).expect(201);

    await agent.get(`/api/vaults/${created.body.data.id}`).expect(200, {
      success: true,
      data: created.body.data,
    });
    await agent.delete(`/api/vaults/${created.body.data.id}`).expect(200, {
      success: true,
      data: { deleted: true },
    });
  });

  it('updates every mutable field on a user Vault and can clear its target date', async () => {
    const created = await agent.post('/api/vaults').send({
      name: 'Trip', emoji: '✈️', targetAmount: '50000', targetDate: '2027-01-15',
    }).expect(201);
    expect(created.body.data.isGeneral).toBe(false);

    const updated = await agent.put(`/api/vaults/${created.body.data.id}`).send({
      name: ' New phone ', emoji: ' 📱 ', targetAmount: '80000',
      id: 'client-controlled', status: 'archived', isGeneral: true,
    }).expect(200);

    expect(updated.body.data).toEqual({
      ...created.body.data,
      name: 'New phone',
      emoji: '📱',
      targetAmount: '80000.00',
      targetDate: undefined,
      isGeneral: false,
      updatedAt: '2026-09-03T09:30:00.000Z',
    });
    expect(updated.body.data).not.toHaveProperty('targetDate');
  });

  it('never archives, deletes, or renames General Savings and keeps contributions usable', async () => {
    const listed = await agent.get('/api/vaults').expect(200);
    const general = listed.body.data.items.find((vault: Vault) => vault.isGeneral);
    expect(general).toEqual(expect.objectContaining({
      name: 'General Savings', emoji: '💰', status: 'active', isGeneral: true,
    }));

    for (const response of [
      await agent.post(`/api/vaults/${general.id}/archive`).expect(409),
      await agent.delete(`/api/vaults/${general.id}`).expect(409),
      await agent.put(`/api/vaults/${general.id}`).send({
        name: 'Holiday', emoji: '🏖️', targetAmount: '500',
      }).expect(409),
    ]) {
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'GENERAL_VAULT_PROTECTED',
          message: 'General Savings cannot be renamed, archived, or deleted',
        },
      });
    }

    const contribution = await agent
      .post(`/api/vaults/${general.id}/contributions`)
      .send({ amount: '25' })
      .expect(201);
    expect(contribution.body.data).toEqual(expect.objectContaining({
      vaultId: general.id, amount: '25.00',
    }));

    const unchanged = await agent.get(`/api/vaults/${general.id}`).expect(200);
    expect(unchanged.body.data).toEqual(expect.objectContaining({
      name: 'General Savings', emoji: '💰', status: 'active', isGeneral: true,
      savedAmount: '25.00',
    }));
  });

  it('allows General Savings target changes only when its identity fields stay canonical', async () => {
    const listed = await agent.get('/api/vaults').expect(200);
    const general = listed.body.data.items.find((vault: Vault) => vault.isGeneral);

    const response = await agent.put(`/api/vaults/${general.id}`).send({
      name: 'General Savings', emoji: '💰', targetAmount: '2500', targetDate: '2028-01-01',
    }).expect(200);

    expect(response.body.data).toEqual(expect.objectContaining({
      id: general.id,
      name: 'General Savings',
      emoji: '💰',
      targetAmount: '2500.00',
      targetDate: '2028-01-01',
      status: 'active',
      isGeneral: true,
    }));
  });

  it.each([
    { body: { name: '', emoji: '📱', targetAmount: '1' } },
    { body: { name: 'n'.repeat(81), emoji: '📱', targetAmount: '1' } },
    { body: { name: 'Phone', emoji: '', targetAmount: '1' } },
    { body: { name: 'Phone', emoji: 'e'.repeat(17), targetAmount: '1' } },
    { body: { name: 'Phone', emoji: '📱', targetAmount: '-1' } },
    { body: { name: 'Phone', emoji: '📱', targetAmount: '1', targetDate: 'not-a-date' } },
  ])('rejects invalid Vault creation input %#', async ({ body }) => {
    const response = await agent.post('/api/vaults').send(body).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-positive contributions', async () => {
    const created = await store.createVault({ name: 'Trip', emoji: '✈️', targetAmount: '1.00' });
    const response = await agent
      .post(`/api/vaults/${created.id}/contributions`)
      .send({ amount: '0' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns stable errors for missing Vault operations', async () => {
    const missingId = '00000000-0000-4000-8000-000000000099';
    for (const response of [
      await agent.get(`/api/vaults/${missingId}`).expect(404),
      await agent.put(`/api/vaults/${missingId}`).send({
        name: 'Missing', emoji: '❓', targetAmount: '1',
      }).expect(404),
      await agent.delete(`/api/vaults/${missingId}`).expect(404),
      await agent.post(`/api/vaults/${missingId}/archive`).expect(404),
      await agent.post(`/api/vaults/${missingId}/contributions`).send({ amount: '1' }).expect(404),
    ]) {
      expect(response.body.error.code).toBe('VAULT_NOT_FOUND');
    }
  });

  it('validates and sanitizes Vault update failures', async () => {
    const created = await store.createVault({ name: 'Trip', emoji: '✈️', targetAmount: '1.00' });
    const invalid = await agent.put(`/api/vaults/${created.id}`).send({
      name: 'Trip', emoji: '✈️', targetAmount: '0',
    }).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    store.updateVault = async () => {
      throw new Error('private Vault storage details');
    };
    const failed = await agent.put(`/api/vaults/${created.id}`).send({
      name: 'Trip', emoji: '✈️', targetAmount: '10',
    }).expect(500);
    expect(failed.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(JSON.stringify(failed.body)).not.toContain('private Vault');
  });

  it('rejects contributions to an archived Vault', async () => {
    const created = await store.createVault({ name: 'Trip', emoji: '✈️', targetAmount: '1.00' });
    await store.archiveVault(created.id);

    const response = await agent
      .post(`/api/vaults/${created.id}/contributions`)
      .send({ amount: '1' })
      .expect(409);

    expect(response.body.error.code).toBe('VAULT_ARCHIVED');
  });
});
