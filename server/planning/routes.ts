import { Router } from 'express';
import { DateTime } from 'luxon';

import {
  annualAnalysisQuerySchema,
  budgetBreakdownQuerySchema,
  monthlyAnalysisQuerySchema,
} from '../../shared/contracts';
import { monthRange, weekRangeContaining, yearRange } from '../lib/time';
import { AppError } from '../middleware/errors';
import type {
  AnnualPlanningQuery,
  BreakdownPlanningQuery,
  MonthlyPlanningQuery,
  PlanningStore,
} from './store';

function invalidDate(error: unknown): AppError {
  return new AppError(
    400,
    'INVALID_DATE',
    error instanceof Error ? error.message : 'Invalid planning date',
  );
}

function weekLabels(range: ReturnType<typeof weekRangeContaining>, timezone: string) {
  const start = DateTime.fromJSDate(range.from, { zone: timezone });
  const end = DateTime.fromJSDate(range.toExclusive, { zone: timezone }).minus({ days: 1 });
  if (!start.isValid || !end.isValid) throw new Error('Invalid planning timezone');
  return {
    weekFromLabel: start.toFormat('yyyy-MM-dd'),
    weekToLabel: end.toFormat('yyyy-MM-dd'),
  };
}

export function createPlanningRouter(store: PlanningStore, timezone: string): Router {
  const router = Router();

  router.get('/analysis/monthly', async (request, response) => {
    const query = monthlyAnalysisQuerySchema.parse(request.query);
    let storeQuery: MonthlyPlanningQuery;
    try {
      const range = monthRange(query.month, timezone);
      const week = weekRangeContaining(query.week ?? `${query.month}-01`, timezone);
      storeQuery = {
        month: query.month,
        timezone,
        range,
        week,
        ...weekLabels(week, timezone),
      };
    } catch (error) {
      throw invalidDate(error);
    }
    const data = await store.getMonthly(storeQuery);
    response.json({ success: true, data });
  });

  router.get('/analysis/breakdown', async (request, response) => {
    const query = budgetBreakdownQuerySchema.parse(request.query);
    let storeQuery: BreakdownPlanningQuery;
    try {
      storeQuery = {
        year: query.year,
        selectedMonth: query.month,
        timezone,
        yearRange: yearRange(query.year, timezone),
        monthRange: monthRange(query.month, timezone),
      };
    } catch (error) {
      throw invalidDate(error);
    }
    const data = await store.getBreakdown(storeQuery);
    response.json({ success: true, data });
  });

  router.get('/analysis/annual', async (request, response) => {
    const query = annualAnalysisQuerySchema.parse(request.query);
    let storeQuery: AnnualPlanningQuery;
    try {
      storeQuery = {
        year: query.year,
        timezone,
        range: yearRange(query.year, timezone),
      };
    } catch (error) {
      throw invalidDate(error);
    }
    const data = await store.getAnnual(storeQuery);
    response.json({ success: true, data });
  });

  return router;
}
