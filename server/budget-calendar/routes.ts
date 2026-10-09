import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';

import {
  budgetCalendarDateSchema,
  budgetCalendarMonthSchema,
  budgetCalendarSummaryQuerySchema,
  createBudgetCalendarCategorySchema,
  createBudgetCalendarExpenseSchema,
  createBudgetCalendarRuleSchema,
  updateBudgetCalendarCategorySchema,
  updateBudgetCalendarExpenseSchema,
  updateBudgetCalendarMonthSchema,
  updateBudgetCalendarRuleSchema,
  updateBudgetCalendarSettingsSchema,
  setBudgetCalendarDayRecordSchema,
  upsertBudgetCalendarOverrideSchema,
} from '../../shared/budget-calendar';
import { AppError } from '../middleware/errors';
import type { BudgetCalendarStore } from './store';

const idSchema = z.string().uuid('ID must be a UUID');

export function createBudgetCalendarRouter(
  store: BudgetCalendarStore,
  timezone: string,
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

  router.get('/months/:month/calendar', async (request, response) => {
    const month = budgetCalendarMonthSchema.parse(request.params.month);
    const today = DateTime.now().setZone(timezone).toISODate();
    if (!today) throw new AppError(500, 'INVALID_TIMEZONE', 'Application timezone is invalid');
    response.json({ success: true, data: await store.getCalendar(month, today) });
  });

  router.get('/months/:month/summary', async (request, response) => {
    const month = budgetCalendarMonthSchema.parse(request.params.month);
    const query = budgetCalendarSummaryQuerySchema.parse(request.query);
    const today = DateTime.now().setZone(timezone).toISODate();
    if (!today) throw new AppError(500, 'INVALID_TIMEZONE', 'Application timezone is invalid');
    response.json({
      success: true,
      data: await store.getSummary(month, query.week ?? `${month}-01`, today),
    });
  });

  router.get('/months/:month/trends', async (request, response) => {
    const month = budgetCalendarMonthSchema.parse(request.params.month);
    const today = DateTime.now().setZone(timezone).toISODate();
    if (!today) throw new AppError(500, 'INVALID_TIMEZONE', 'Application timezone is invalid');
    response.json({ success: true, data: await store.getTrends(month, today) });
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

  router.get('/days/:date', async (request, response) => {
    const date = budgetCalendarDateSchema.parse(request.params.date);
    const today = DateTime.now().setZone(timezone).toISODate();
    if (!today) throw new AppError(500, 'INVALID_TIMEZONE', 'Application timezone is invalid');
    response.json({ success: true, data: await store.getDay(date, today) });
  });

  router.post('/expenses', async (request, response) => {
    const input = createBudgetCalendarExpenseSchema.parse(request.body);
    const result = await store.createExpense(input);
    if (result.outcome === 'invalid_category') {
      throw new AppError(
        400,
        'BUDGET_CALENDAR_CATEGORY_INVALID',
        'Budget Calendar category is missing or inactive',
      );
    }
    response.status(result.outcome === 'created' ? 201 : 200).json({
      success: true,
      data: result.expense,
    });
  });

  router.put('/expenses/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = updateBudgetCalendarExpenseSchema.parse(request.body);
    const result = await store.updateExpense(id, input);
    if (result === 'invalid_category') {
      throw new AppError(
        400,
        'BUDGET_CALENDAR_CATEGORY_INVALID',
        'Budget Calendar category is missing or inactive',
      );
    }
    if (!result) {
      throw new AppError(
        404,
        'BUDGET_CALENDAR_EXPENSE_NOT_FOUND',
        'Budget Calendar expense not found',
      );
    }
    response.json({ success: true, data: result });
  });

  router.delete('/expenses/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    if (!(await store.deleteExpense(id))) {
      throw new AppError(
        404,
        'BUDGET_CALENDAR_EXPENSE_NOT_FOUND',
        'Budget Calendar expense not found',
      );
    }
    response.json({ success: true, data: { deleted: true } });
  });

  router.put('/days/:date/record-state', async (request, response) => {
    const date = budgetCalendarDateSchema.parse(request.params.date);
    const { recordedZero } = setBudgetCalendarDayRecordSchema.parse(request.body);
    const outcome = await store.setDayRecordState(date, recordedZero);
    if (outcome === 'expenses_exist') {
      throw new AppError(
        409,
        'BUDGET_CALENDAR_DAY_HAS_EXPENSES',
        'A day with expenses cannot be recorded as zero spending',
      );
    }
    response.json({
      success: true,
      data: { date, recordState: recordedZero ? 'recorded_zero' : 'missing' },
    });
  });

  return router;
}
