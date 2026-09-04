import { Router } from 'express';

import {
  reviewSubscriptionSchema,
  subscriptionMerchantKeySchema,
} from '../../shared/contracts';
import { AppError } from '../middleware/errors';
import type { SubscriptionStore } from './store';

export function createSubscriptionRouter(store: SubscriptionStore, timezone: string): Router {
  const router = Router();
  router.get('/subscriptions/candidates', async (_request, response) => {
    response.json({ success: true, data: await store.listCandidates(new Date(), timezone) });
  });
  router.put('/subscriptions/:merchantKey/review', async (request, response) => {
    const merchantKey = subscriptionMerchantKeySchema.parse(request.params.merchantKey);
    const { status } = reviewSubscriptionSchema.parse(request.body);
    const candidate = await store.reviewCandidate(merchantKey, status, new Date(), timezone);
    if (!candidate) {
      throw new AppError(404, 'SUBSCRIPTION_CANDIDATE_NOT_FOUND', 'Subscription candidate was not found or is stale');
    }
    response.json({ success: true, data: candidate });
  });
  return router;
}
