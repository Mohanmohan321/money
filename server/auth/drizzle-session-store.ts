import { and, eq, gt, lte } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { sessions } from '../db/schema';
import type { SessionStore } from './session-store';

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly database: AppDatabase) {}

  async create(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.insert(sessions).values({ tokenHash, expiresAt });
  }

  async isValid(tokenHash: string, now: Date): Promise<boolean> {
    const [session] = await this.database
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);
    return Boolean(session);
  }

  async delete(tokenHash: string): Promise<void> {
    await this.database.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.database.delete(sessions).where(lte(sessions.expiresAt, now));
  }
}
