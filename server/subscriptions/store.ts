import type {
  SubscriptionCandidate,
  SubscriptionCandidateList,
  SubscriptionReviewStatus,
} from '../../shared/contracts';

export interface SubscriptionStore {
  listCandidates(now: Date, timezone: string): Promise<SubscriptionCandidateList>;
  reviewCandidate(
    merchantKey: string,
    status: SubscriptionReviewStatus,
    now: Date,
    timezone: string,
  ): Promise<SubscriptionCandidate | undefined>;
}
