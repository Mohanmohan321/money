import { Router } from 'express';

import { analyticsQuerySchema, historyQuerySchema } from '../../shared/contracts';
import { AppError } from '../middleware/errors';
import { analyticsRange, dashboardRanges, localDateBounds } from '../lib/time';
import type { AggregateStore } from './store';

export function createAggregateRouter(
  store: AggregateStore,
  timezone: string,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();

  router.get('/history', async (request, response) => {
    const query = historyQuerySchema.parse(request.query);
    let bounds;
    try {
      bounds = localDateBounds(query.from, query.to, timezone);
    } catch (error) {
      throw new AppError(400, 'INVALID_DATE', error instanceof Error ? error.message : 'Invalid date');
    }
    const result = await store.getHistory({
      ...(query.type ? { type: query.type } : {}),
      ...bounds,
      limit: query.limit,
      offset: query.offset,
    });
    response.json({
      success: true,
      data: { ...result, limit: query.limit, offset: query.offset },
    });
  });

  router.get('/dashboard', async (_request, response) => {
    const data = await store.getDashboard({
      timezone,
      ranges: dashboardRanges(now(), timezone),
    });
    response.json({ success: true, data });
  });

  router.get('/analytics', async (request, response) => {
    const query = analyticsQuerySchema.parse(request.query);
    let range;
    try {
      range = analyticsRange(query.period, now(), timezone, query.from, query.to);
    } catch (error) {
      throw new AppError(400, 'INVALID_DATE', error instanceof Error ? error.message : 'Invalid date');
    }
    const data = await store.getAnalytics({
      period: query.period,
      timezone,
      ...range,
    });
    response.json({ success: true, data });
  });

  return router;
}
