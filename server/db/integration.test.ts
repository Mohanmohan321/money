import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DrizzleAggregateStore } from '../aggregates/drizzle-aggregate-store';
import { DrizzleSessionStore } from '../auth/drizzle-session-store';
import { hashSessionToken } from '../auth/session';
import { DrizzleRecordStore } from '../records/drizzle-record-store';
import { createDatabase } from './client';
import { transactions } from './schema';

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

      expect((await records.getTransaction(transaction.id))?.amount).toBe('10.10');
      expect((await records.getLent(lent.id))?.amount).toBe('20.20');
      expect((await records.getBorrowed(borrowed.id))?.amount).toBe('30.30');
      expect(transaction.createdAt).toMatch(/Z$/);

      const history = await aggregates.getHistory({ from, toExclusive, limit: 100, offset: 0 });
      expect(history.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: transaction.id, type: 'transaction', description, amount: '10.10' }),
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
});
