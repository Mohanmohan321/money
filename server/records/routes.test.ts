import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CreatePersonRecordInput,
  CreateTransactionInput,
  PersonRecord,
  TransactionRecord,
} from '../../shared/contracts';
import { createApp } from '../app';
import type { SessionStore } from '../auth/session-store';
import type { AppConfig } from '../config';
import { createRecordsRouter } from './routes';
import type { ListFilters, RecordStore } from './store';

class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Date>();
  async create(hash: string, expiresAt: Date) { this.sessions.set(hash, expiresAt); }
  async isValid(hash: string, now: Date) { return (this.sessions.get(hash)?.getTime() ?? 0) > now.getTime(); }
  async delete(hash: string) { this.sessions.delete(hash); }
}

class MemoryRecordStore implements RecordStore {
  private readonly transactions = new Map<string, TransactionRecord>();
  private readonly lent = new Map<string, PersonRecord>();
  private readonly borrowed = new Map<string, PersonRecord>();
  private nextId = 1;
  lastFilters: ListFilters = {};

  async createTransaction(input: CreateTransactionInput) {
    const item = { id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`, ...input, category: input.category ?? 'other' as const, createdAt: '2026-09-02T10:00:00.000Z' };
    this.transactions.set(item.id, item);
    return item;
  }
  async listTransactions(filters: ListFilters) { this.lastFilters = filters; return [...this.transactions.values()]; }
  async getTransaction(id: string) { return this.transactions.get(id); }
  async deleteTransaction(id: string) { return this.transactions.delete(id); }

  async createLent(input: CreatePersonRecordInput) {
    const item = { id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`, ...input, createdAt: '2026-09-02T11:00:00.000Z' };
    this.lent.set(item.id, item);
    return item;
  }
  async listLent(filters: ListFilters) { this.lastFilters = filters; return [...this.lent.values()]; }
  async getLent(id: string) { return this.lent.get(id); }
  async deleteLent(id: string) { return this.lent.delete(id); }

  async createBorrowed(input: CreatePersonRecordInput) {
    const item = { id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`, ...input, createdAt: '2026-09-02T12:00:00.000Z' };
    this.borrowed.set(item.id, item);
    return item;
  }
  async listBorrowed(filters: ListFilters) { this.lastFilters = filters; return [...this.borrowed.values()]; }
  async getBorrowed(id: string) { return this.borrowed.get(id); }
  async deleteBorrowed(id: string) { return this.borrowed.delete(id); }
}

const config: AppConfig = {
  nodeEnv: 'test', databaseUrl: 'postgresql://unused', appPassword: '2003',
  sessionSecret: 'test-session-secret-at-least-32-characters', timezone: 'Asia/Kolkata',
  appOrigin: 'http://localhost:5173', port: 3001,
};

describe('financial record APIs', () => {
  let store: MemoryRecordStore;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    store = new MemoryRecordStore();
    const app = createApp({
      config,
      sessionStore: new MemorySessionStore(),
      protectedRouter: createRecordsRouter(store, config.timezone),
    });
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: '2003' }).expect(200);
  });

  it.each([
    { base: '/api/transactions', input: { description: '  Groceries  ', amount: '23.4' }, label: 'description', expectedLabel: 'Groceries', expectedAmount: '23.40' },
    { base: '/api/lent', input: { personName: '  Maya  ', amount: '50' }, label: 'personName', expectedLabel: 'Maya', expectedAmount: '50.00' },
    { base: '/api/borrowed', input: { personName: '  Arun  ', amount: '75.25' }, label: 'personName', expectedLabel: 'Arun', expectedAmount: '75.25' },
  ])('creates, lists, reads, and deletes $base records', async ({ base, input, label, expectedLabel, expectedAmount }) => {
    const created = await agent
      .post(base)
      .send({ ...input, id: 'client-controlled', createdAt: '2000-01-01T00:00:00Z' })
      .expect(201);

    expect(created.body).toEqual({
      success: true,
      data: expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        [label]: expectedLabel,
        amount: expectedAmount,
        createdAt: expect.stringMatching(/^2026-09-02T/),
      }),
    });

    const id = created.body.data.id as string;
    const list = await agent.get(base).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    await agent.get(`${base}/${id}`).expect(200);
    await agent.delete(`${base}/${id}`).expect(200, { success: true, data: { deleted: true } });
    await agent.get(`${base}/${id}`).expect(404);
  });

  it.each([
    ['/api/transactions', { description: '', amount: '1' }],
    ['/api/lent', { personName: 'Maya', amount: '0' }],
    ['/api/borrowed', { personName: 'Arun', amount: 10 }],
  ])('rejects malformed input for %s', async (path, input) => {
    const response = await agent.post(path).send(input).expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates local dates and passes UTC filter boundaries to storage', async () => {
    await agent.get('/api/transactions?from=2026-09-02&to=2026-09-02').expect(200);
    expect(store.lastFilters.from?.toISOString()).toBe('2026-09-01T18:30:00.000Z');
    expect(store.lastFilters.toExclusive?.toISOString()).toBe('2026-09-02T18:30:00.000Z');

    const invalid = await agent.get('/api/transactions?from=2026-02-30').expect(400);
    expect(invalid.body.error.code).toBe('INVALID_DATE');
  });

  it('rejects malformed UUIDs without touching storage', async () => {
    const response = await agent.get('/api/transactions/not-a-uuid').expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
