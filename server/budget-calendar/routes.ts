import { Router } from 'express';
import { z } from 'zod';

import {
  budgetCalendarDateSchema,
  budgetCalendarMonthSchema,
  createBudgetCalendarCategorySchema,
  createBudgetCalendarRuleSchema,
  updateBudgetCalendarCategorySchema,
  updateBudgetCalendarMonthSchema,
  updateBudgetCalendarRuleSchema,
  updateBudgetCalendarSettingsSchema,
  upsertBudgetCalendarOverrideSchema,
} from '../../shared/budget-calendar';
import { AppError } from '../middleware/errors';
import type { BudgetCalendarStore } from './store';

const idSchema = z.string().uuid('ID must be a UUID');

export function createBudgetCalendarRouter(
  store: BudgetCalendarStore,
  _timezone: string,
): Router {
  const router = Router();

  router.get('/settings', async (_request, response) => {
    response.json({ success: true, data: await store.getSettings() });
  });

  router.put('/settings', async (request, response) => {
    const input = updateBudgetCalendarSettingsSchema.parse(request.body);
    response.json({ success: true, data: await store.updateSettings(input) });
  });

  router.get('/categories', async (request, response) => {
    const includeArchived = request.query.includeArchived === 'true';
    response.json({
      success: true,
      data: { items: await store.listCategories({ includeArchived }) },
    });
  });

  router.post('/categories', async (request, response) => {
    const input = createBudgetCalendarCategorySchema.parse(request.body);
    response.status(201).json({ success: true, data: await store.createCategory(input) });
  });

  router.put('/categories/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = updateBudgetCalendarCategorySchema.parse(request.body);
    const item = await store.updateCategory(id, input);
    if (!item) {
      throw new AppError(404, 'BUDGET_CALENDAR_CATEGORY_NOT_FOUND', 'Budget category not found');
    }
    response.json({ success: true, data: item });
  });

  router.delete('/categories/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const outcome = await store.archiveCategory(id);
    if (outcome === 'missing') {
      throw new AppError(404, 'BUDGET_CALENDAR_CATEGORY_NOT_FOUND', 'Budget category not found');
    }
    response.json({
      success: true,
      data: { archived: outcome === 'archived', deleted: outcome === 'deleted' },
    });
  });

  router.get('/months/:month', async (request, response) => {
    const month = budgetCalendarMonthSchema.parse(request.params.month);
    response.json({ success: true, data: await store.getMonth(month) });
  });

  router.put('/months/:month', async (request, response) => {
    const month = budgetCalendarMonthSchema.parse(request.params.month);
    const input = updateBudgetCalendarMonthSchema.parse(request.body);
    response.json({ success: true, data: await store.updateMonth(month, input) });
  });

  router.get('/rules', async (_request, response) => {
    response.json({ success: true, data: { items: await store.listRules() } });
  });

  router.post('/rules', async (request, response) => {
    const input = createBudgetCalendarRuleSchema.parse(request.body);
    response.status(201).json({ success: true, data: await store.createRule(input) });
  });

  router.put('/rules/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = updateBudgetCalendarRuleSchema.parse(request.body);
    const item = await store.updateRule(id, input);
    if (!item) {
      throw new AppError(404, 'BUDGET_CALENDAR_RULE_NOT_FOUND', 'Budget rule not found');
    }
    response.json({ success: true, data: item });
  });

  router.delete('/rules/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    if (!(await store.deleteRule(id))) {
      throw new AppError(404, 'BUDGET_CALENDAR_RULE_NOT_FOUND', 'Budget rule not found');
    }
    response.json({ success: true, data: { deleted: true } });
  });

  router.put('/overrides/:date', async (request, response) => {
    const date = budgetCalendarDateSchema.parse(request.params.date);
    const input = upsertBudgetCalendarOverrideSchema.parse(request.body);
    response.json({ success: true, data: await store.upsertOverride(date, input) });
  });

  router.delete('/overrides/:date', async (request, response) => {
    const date = budgetCalendarDateSchema.parse(request.params.date);
    if (!(await store.deleteOverride(date))) {
      throw new AppError(404, 'BUDGET_CALENDAR_OVERRIDE_NOT_FOUND', 'Budget override not found');
    }
    response.json({ success: true, data: { deleted: true } });
  });

  return router;
}
