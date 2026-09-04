import Decimal from 'decimal.js';
import { asc, eq, sql } from 'drizzle-orm';

import type {
  SpendingCategory,
  SubscriptionCandidate,
  SubscriptionCandidateList,
  SubscriptionReviewStatus,
  TransactionRecord,
} from '../../shared/contracts';
import type { AppDatabase } from '../db/client';
import { subscriptionReviews, transactions } from '../db/schema';
import { detectSubscriptions } from './detector';
import type { SubscriptionStore } from './store';

export class DrizzleSubscriptionStore implements SubscriptionStore {
  constructor(private readonly database: AppDatabase) {}

  private async detected(now: Date, timezone: string) {
    const rows = await this.database.select().from(transactions).orderBy(asc(transactions.createdAt), asc(transactions.id));
    const records: TransactionRecord[] = rows.map((row) => ({
      id: row.id,
      description: row.description,
      category: row.category as SpendingCategory,
      amount: String(row.amount),
      createdAt: row.createdAt.toISOString(),
    }));
    return detectSubscriptions(records, now, timezone);
  }

  async listCandidates(now: Date, timezone: string): Promise<SubscriptionCandidateList> {
    const [detected, reviews] = await Promise.all([
      this.detected(now, timezone),
      this.database.select().from(subscriptionReviews),
    ]);
    const statusByKey = new Map(reviews.map((review) => [review.merchantKey, review.status as SubscriptionReviewStatus]));
    const items = detected.map((candidate): SubscriptionCandidate => ({
      ...candidate,
      reviewStatus: statusByKey.get(candidate.merchantKey) ?? 'pending',
    })).filter((candidate) => candidate.reviewStatus !== 'dismissed');
    const ForecastDecimal = Decimal.clone({ precision: Math.max(40, ...items.map((item) => item.monthlyEquivalent.replace('.', '').length + 12)) });
    const confirmedMonthlyForecast = items
      .filter((item) => item.reviewStatus === 'confirmed')
      .reduce((sum, item) => sum.plus(item.monthlyEquivalent), new ForecastDecimal(0))
      .toFixed(2);
    return { items, confirmedMonthlyForecast };
  }

  async reviewCandidate(
    merchantKey: string,
    status: SubscriptionReviewStatus,
    now: Date,
    timezone: string,
  ): Promise<SubscriptionCandidate | undefined> {
    const candidate = (await this.detected(now, timezone)).find((item) => item.merchantKey === merchantKey);
    if (!candidate) return undefined;
    await this.database.insert(subscriptionReviews).values({
      merchantKey,
      status,
      cadence: candidate.cadence,
      representativeAmount: candidate.typicalAmount,
      supportingTransactionIds: candidate.supportingTransactionIds,
      nextExpectedAt: new Date(candidate.nextExpectedAt),
    }).onConflictDoUpdate({
      target: subscriptionReviews.merchantKey,
      set: {
        status,
        cadence: candidate.cadence,
        representativeAmount: candidate.typicalAmount,
        supportingTransactionIds: candidate.supportingTransactionIds,
        nextExpectedAt: new Date(candidate.nextExpectedAt),
        updatedAt: sql`now()`,
      },
    });
    return { ...candidate, reviewStatus: status };
  }
}
