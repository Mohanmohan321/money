import { Router } from 'express';
import { z } from 'zod';

import {
  createIncomeSchema,
  dateFilterSchema,
  monthSchema,
  updateIncomeSchema,
  upsertBudgetSchema,
} from '../../shared/contracts';
import { localDateBounds } from '../lib/time';
import { AppError } from '../middleware/errors';
import type { BudgetStore } from './store';

export function createBudgetRouter(store: BudgetStore, timezone: string): Router {
  const router = Router();
  const idSchema = z.string().uuid('Income ID must be a UUID');

  router.get('/budgets/:month', async (request, response) => {
    const month = monthSchema.parse(request.params.month);
    const budget = await store.getBudget(month);
    response.json({ success: true, data: budget });
  });

  router.put('/budgets/:month', async (request, response) => {
    const month = monthSchema.parse(request.params.month);
    const input = upsertBudgetSchema.parse(request.body);
    const budget = await store.upsertBudget(month, input);
    response.json({ success: true, data: budget });
  });

  router.post('/income', async (request, response) => {
    const input = createIncomeSchema.parse(request.body);
    const income = await store.createIncome(input);
    response.status(201).json({ success: true, data: income });
  });

  router.get('/income', async (request, response) => {
    const query = dateFilterSchema.parse(request.query);
    let filters;
    try {
      filters = localDateBounds(query.from, query.to, timezone);
    } catch (error) {
      throw new AppError(
        400,
        'INVALID_DATE',
        error instanceof Error ? error.message : 'Invalid date filter',
      );
    }
    const items = await store.listIncome(filters);
    response.json({ success: true, data: { items } });
  });

  router.get('/income/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const income = await store.getIncome(id);
    if (!income) {
      throw new AppError(404, 'INCOME_NOT_FOUND', 'Income record not found');
    }
    response.json({ success: true, data: income });
  });

  router.put('/income/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = updateIncomeSchema.parse(request.body);
    const income = await store.updateIncome(id, input);
    if (!income) {
      throw new AppError(404, 'INCOME_NOT_FOUND', 'Income record not found');
    }
    response.json({ success: true, data: income });
  });

  router.delete('/income/:id', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    if (!(await store.deleteIncome(id))) {
      throw new AppError(404, 'INCOME_NOT_FOUND', 'Income record not found');
    }
    response.json({ success: true, data: { deleted: true } });
  });

  return router;
}
