import Decimal from 'decimal.js';
import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createVaultContributionSchema,
  createVaultSchema,
  type CreateVaultContributionInput,
  type CreateVaultInput,
  type Vault,
  type VaultContribution,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { calculateProgressPercent } from './drizzle-vault-store';
import { createVaultRouter } from './routes';
import type { ContributionResult, DeleteVaultResult, VaultStore } from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

class MemoryVaultStore implements VaultStore {
  readonly vaults = new Map<string, Vault>();
  readonly contributions = new Map<string, VaultContribution[]>();
  private nextId = 1;

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
    if (![...this.vaults.values()].some((vault) => vault.name === 'General Savings')) {
      await this.createVault({ name: 'General Savings', emoji: '💰', targetAmount: '1.00' });
    }
    return [...this.vaults.values()].map((vault) => this.withProgress(vault));
  }

  async createVault(input: CreateVaultInput): Promise<Vault> {
    const now = '2026-09-03T08:00:00.000Z';
    const vault: Vault = {
      id: this.id(),
      ...input,
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

  async archiveVault(id: string): Promise<Vault | undefined> {
    const vault = this.vaults.get(id);
    if (!vault) return undefined;
    const archived: Vault = {
      ...vault,
      status: 'archived',
      updatedAt: '2026-09-03T10:00:00.000Z',
    };
    this.vaults.set(id, archived);
    return this.withProgress(archived);
  }

  async deleteVault(id: string): Promise<DeleteVaultResult> {
    if (!this.vaults.has(id)) return 'not_found';
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
      await agent.delete(`/api/vaults/${missingId}`).expect(404),
      await agent.post(`/api/vaults/${missingId}/archive`).expect(404),
      await agent.post(`/api/vaults/${missingId}/contributions`).send({ amount: '1' }).expect(404),
    ]) {
      expect(response.body.error.code).toBe('VAULT_NOT_FOUND');
    }
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
