import Decimal from 'decimal.js';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AssetRecord,
  CreateAssetInput,
  CreateLiabilityInput,
  LiabilityRecord,
  NetWorthSummary,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import type { AppDatabase } from '../db/client';
import { DrizzleNetWorthStore } from './drizzle-net-worth-store';
import { createNetWorthRouter } from './routes';
import type { NetWorthStore } from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

class MemoryNetWorthStore implements NetWorthStore {
  readonly assets = new Map<string, AssetRecord>();
  readonly liabilities = new Map<string, LiabilityRecord>();
  manualAssets = '0.00';
  receivables = '0.00';
  manualLiabilities = '0.00';
  borrowedDebt = '0.00';
  private nextId = 1;

  private id(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  async createAsset(input: CreateAssetInput): Promise<AssetRecord> {
    const now = '2026-09-03T08:00:00.000Z';
    const asset = { id: this.id(), ...input, createdAt: now, updatedAt: now };
    this.assets.set(asset.id, asset);
    return asset;
  }

  async listAssets(): Promise<AssetRecord[]> { return [...this.assets.values()]; }

  async updateAsset(id: string, input: CreateAssetInput): Promise<AssetRecord | undefined> {
    const existing = this.assets.get(id);
    if (!existing) return undefined;
    const { note: _oldNote, ...withoutNote } = existing;
    const asset = { ...withoutNote, ...input, updatedAt: '2026-09-03T09:00:00.000Z' };
    this.assets.set(id, asset);
    return asset;
  }

  async deleteAsset(id: string): Promise<boolean> { return this.assets.delete(id); }

  async createLiability(input: CreateLiabilityInput): Promise<LiabilityRecord> {
    const now = '2026-09-03T08:00:00.000Z';
    const liability = { id: this.id(), ...input, createdAt: now, updatedAt: now };
    this.liabilities.set(liability.id, liability);
    return liability;
  }

  async listLiabilities(): Promise<LiabilityRecord[]> { return [...this.liabilities.values()]; }

  async updateLiability(
    id: string,
    input: CreateLiabilityInput,
  ): Promise<LiabilityRecord | undefined> {
    const existing = this.liabilities.get(id);
    if (!existing) return undefined;
    const { note: _oldNote, ...withoutNote } = existing;
    const liability = { ...withoutNote, ...input, updatedAt: '2026-09-03T09:00:00.000Z' };
    this.liabilities.set(id, liability);
    return liability;
  }

  async deleteLiability(id: string): Promise<boolean> { return this.liabilities.delete(id); }

  async getNetWorth(): Promise<NetWorthSummary> {
    const totalOwned = new Decimal(this.manualAssets).plus(this.receivables);
    const totalOwed = new Decimal(this.manualLiabilities).plus(this.borrowedDebt);
    const netWorth = totalOwned.minus(totalOwed);
    return {
      manualAssets: this.manualAssets,
      receivables: this.receivables,
      totalOwned: totalOwned.toFixed(2),
      manualLiabilities: this.manualLiabilities,
      borrowedDebt: this.borrowedDebt,
      totalOwed: totalOwed.toFixed(2),
      netWorth: netWorth.toFixed(2),
      status: netWorth.isZero() ? 'zero' : netWorth.isPositive() ? 'positive' : 'negative',
    };
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

describe('Net Worth APIs', () => {
  let store: MemoryNetWorthStore;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryNetWorthStore();
    agent = request.agent(createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter: createNetWorthRouter(store),
    }));
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it('creates, lists, updates, and deletes an asset', async () => {
    const created = await agent.post('/api/assets').send({
      name: '  Primary bank  ',
      type: 'bank',
      currentValue: '125000.5',
      note: '  Salary account  ',
      id: 'client-controlled',
      createdAt: '2000-01-01T00:00:00.000Z',
    }).expect(201);

    expect(created.body.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Primary bank',
      type: 'bank',
      currentValue: '125000.50',
      note: 'Salary account',
      createdAt: '2026-09-03T08:00:00.000Z',
      updatedAt: '2026-09-03T08:00:00.000Z',
    });

    const id = created.body.data.id as string;
    await agent.get('/api/assets').expect(200, {
      success: true,
      data: { items: [created.body.data] },
    });

    const updated = await agent.put(`/api/assets/${id}`).send({
      name: 'Index funds',
      type: 'investment',
      currentValue: '150000',
    }).expect(200);
    const { note: _createdNote, ...createdWithoutNote } = created.body.data;
    expect(updated.body.data).toEqual({
      ...createdWithoutNote,
      name: 'Index funds',
      type: 'investment',
      currentValue: '150000.00',
      updatedAt: '2026-09-03T09:00:00.000Z',
    });
    expect(updated.body.data).not.toHaveProperty('note');

    await agent.delete(`/api/assets/${id}`).expect(200, {
      success: true,
      data: { deleted: true },
    });
    await agent.get('/api/assets').expect(200, { success: true, data: { items: [] } });
  });

  it('creates, lists, updates, and deletes a liability', async () => {
    const created = await agent.post('/api/liabilities').send({
      name: '  Home loan  ',
      type: 'mortgage',
      outstandingBalance: '70000',
      note: '  Floating rate  ',
    }).expect(201);

    expect(created.body.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Home loan',
      type: 'mortgage',
      outstandingBalance: '70000.00',
      note: 'Floating rate',
      createdAt: '2026-09-03T08:00:00.000Z',
      updatedAt: '2026-09-03T08:00:00.000Z',
    });

    const id = created.body.data.id as string;
    await agent.get('/api/liabilities').expect(200, {
      success: true,
      data: { items: [created.body.data] },
    });

    const updated = await agent.put(`/api/liabilities/${id}`).send({
      name: 'Travel card',
      type: 'credit-card',
      outstandingBalance: '12000.75',
    }).expect(200);
    const { note: _createdNote, ...createdWithoutNote } = created.body.data;
    expect(updated.body.data).toEqual({
      ...createdWithoutNote,
      name: 'Travel card',
      type: 'credit-card',
      outstandingBalance: '12000.75',
      updatedAt: '2026-09-03T09:00:00.000Z',
    });
    expect(updated.body.data).not.toHaveProperty('note');

    await agent.delete(`/api/liabilities/${id}`).expect(200, {
      success: true,
      data: { deleted: true },
    });
    await agent.get('/api/liabilities').expect(200, { success: true, data: { items: [] } });
  });

  it.each([
    ['/api/assets', { name: 'Wallet', type: 'crypto', currentValue: '1' }],
    ['/api/assets', { name: 'Wallet', type: 'cash', currentValue: '0' }],
    ['/api/assets', { name: 'Wallet', type: 'cash', currentValue: '1', note: 'n'.repeat(501) }],
    ['/api/liabilities', { name: 'Card', type: 'informal', outstandingBalance: '1' }],
    ['/api/liabilities', { name: 'Card', type: 'loan', outstandingBalance: -1 }],
    ['/api/liabilities', { name: 'Card', type: 'loan', outstandingBalance: '1', note: 'n'.repeat(501) }],
  ])('rejects invalid create payloads for %s %#', async (path, body) => {
    const response = await agent.post(path).send(body).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates update payloads and UUID route parameters', async () => {
    const asset = await store.createAsset({ name: 'Cash', type: 'cash', currentValue: '1.00' });
    const liability = await store.createLiability({
      name: 'Loan', type: 'loan', outstandingBalance: '1.00',
    });

    for (const response of [
      await agent.put(`/api/assets/${asset.id}`).send({
        name: 'Cash', type: 'not-an-asset', currentValue: '1',
      }).expect(400),
      await agent.put(`/api/liabilities/${liability.id}`).send({
        name: 'Loan', type: 'loan', outstandingBalance: '0',
      }).expect(400),
      await agent.delete('/api/assets/not-a-uuid').expect(400),
      await agent.delete('/api/liabilities/not-a-uuid').expect(400),
    ]) {
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns stable not-found errors for missing asset and liability IDs', async () => {
    const missingId = '00000000-0000-4000-8000-000000000099';
    const cases = [
      [await agent.put(`/api/assets/${missingId}`).send({
        name: 'Cash', type: 'cash', currentValue: '1',
      }).expect(404), 'ASSET_NOT_FOUND'],
      [await agent.delete(`/api/assets/${missingId}`).expect(404), 'ASSET_NOT_FOUND'],
      [await agent.put(`/api/liabilities/${missingId}`).send({
        name: 'Loan', type: 'loan', outstandingBalance: '1',
      }).expect(404), 'LIABILITY_NOT_FOUND'],
      [await agent.delete(`/api/liabilities/${missingId}`).expect(404), 'LIABILITY_NOT_FOUND'],
    ] as const;

    for (const [response, code] of cases) expect(response.body.error.code).toBe(code);
  });

  it('composes owned, owed, and net worth without double counting', async () => {
    store.manualAssets = '300000.00';
    store.receivables = '20000.00';
    store.manualLiabilities = '70000.00';
    store.borrowedDebt = '10000.00';
    const response = await agent.get('/api/net-worth').expect(200);
    expect(response.body.data).toEqual({
      manualAssets: '300000.00', receivables: '20000.00', totalOwned: '320000.00',
      manualLiabilities: '70000.00', borrowedDebt: '10000.00', totalOwed: '80000.00',
      netWorth: '240000.00', status: 'positive',
    });
  });

  it.each([
    {
      values: ['100.00', '10.00', '90.00', '20.00'],
      expected: { netWorth: '0.00', status: 'zero' },
    },
    {
      values: ['100.00', '0.00', '120.00', '30.00'],
      expected: { netWorth: '-50.00', status: 'negative' },
    },
  ])('reports $expected.status net worth', async ({ values, expected }) => {
    [store.manualAssets, store.receivables, store.manualLiabilities, store.borrowedDebt] = values;
    const response = await agent.get('/api/net-worth').expect(200);
    expect(response.body.data).toEqual(expect.objectContaining(expected));
  });
});

describe('DrizzleNetWorthStore', () => {
  it('preserves cents when two maximum records exceed Decimal default precision', async () => {
    const aggregateOfTwoMaximumRecords = '1999999999999999999.98';
    const database = {
      execute: async (statement: SQL) => {
        const emittedSql = new PgDialect().sqlToQuery(statement).sql.toLowerCase();
        if (/::numeric\(20,\s*2\)/.test(emittedSql)) {
          throw Object.assign(new Error('numeric field overflow'), { code: '22003' });
        }
        return {
          rows: [{
            manualAssets: aggregateOfTwoMaximumRecords,
            receivables: '0.00',
            manualLiabilities: '0.00',
            borrowedDebt: '0.00',
          }],
        };
      },
    } as unknown as AppDatabase;

    await expect(new DrizzleNetWorthStore(database).getNetWorth()).resolves.toEqual({
      manualAssets: '1999999999999999999.98',
      receivables: '0.00',
      totalOwned: '1999999999999999999.98',
      manualLiabilities: '0.00',
      borrowedDebt: '0.00',
      totalOwed: '0.00',
      netWorth: '1999999999999999999.98',
      status: 'positive',
    });
  });

  it('uses one aggregate statement with four scalar subqueries and Decimal composition', async () => {
    const statements: SQL[] = [];
    const database = {
      execute: async (statement: SQL) => {
        statements.push(statement);
        return {
          rows: [{
            manualAssets: '0.10',
            receivables: '0.20',
            manualLiabilities: '0.25',
            borrowedDebt: '0.05',
          }],
        };
      },
    } as unknown as AppDatabase;

    const result = await new DrizzleNetWorthStore(database).getNetWorth();

    expect(result).toEqual({
      manualAssets: '0.10', receivables: '0.20', totalOwned: '0.30',
      manualLiabilities: '0.25', borrowedDebt: '0.05', totalOwed: '0.30',
      netWorth: '0.00', status: 'zero',
    });
    expect(statements).toHaveLength(1);
    const emittedSql = new PgDialect().sqlToQuery(statements[0]).sql.toLowerCase();
    expect(emittedSql.match(/select/g)).toHaveLength(5);
    expect(emittedSql).toContain('from "assets"');
    expect(emittedSql).toContain('from "money_lent"');
    expect(emittedSql).toContain('from "liabilities"');
    expect(emittedSql).toContain('from "money_borrowed"');
  });
});
