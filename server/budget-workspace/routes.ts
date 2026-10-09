import { Router } from 'express';
import { z } from 'zod';

import { monthSchema, moneySchema, planMoneySchema } from '../../shared/contracts';
import { AppError } from '../middleware/errors';
import type { BudgetWorkspaceStore } from './store';

const validDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
};
const dateSchema = z.string().refine(validDate, 'Date must be a valid YYYY-MM-DD calendar date');
const categorySchema = z.object({
  id: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(80),
  group: z.enum(['grocery', 'meal', 'petrol', 'snacks', 'miscellaneous', 'other']),
  monthlyAmount: planMoneySchema, includedInOverallBudget: z.boolean(),
  schedule: z.enum(['daily', 'weekdays', 'monthly', 'unassigned']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7), active: z.boolean(),
});
const settingsSchema = z.object({
  overallMonthlyLimit: planMoneySchema, weeklyFoodTarget: planMoneySchema,
  weekStart: z.literal(1), categories: z.array(categorySchema).min(1).max(100),
}).superRefine((value, context) => {
  const ids = new Set<string>();
  value.categories.forEach((category, index) => {
    if (ids.has(category.id)) context.addIssue({ code: 'custom', message: 'Category IDs must be unique', path: ['categories', index, 'id'] });
    ids.add(category.id);
  });
});
const expenseSchema = z.object({
  expenseDate: dateSchema, amount: moneySchema,
  budgetCategory: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(200), notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

export function createBudgetWorkspaceRouter(store: BudgetWorkspaceStore) {
  const router = Router();
  async function validateCategory(expenseDate: string, categoryId: string) {
    const workspace = await store.getWorkspace(expenseDate.slice(0, 7), expenseDate);
    if (!workspace.settings.categories.some((category) => category.id === categoryId && category.active)) {
      throw new AppError(400, 'BUDGET_CATEGORY_NOT_FOUND', 'Budget category not found');
    }
  }
  router.get('/:month', async (request, response) => {
    const month = monthSchema.parse(request.params.month);
    const today = dateSchema.parse(request.query.today ?? `${month}-01`);
    response.json({ success: true, data: await store.getWorkspace(month, today) });
  });
  router.put('/settings', async (request, response) => {
    response.json({ success: true, data: await store.saveSettings(settingsSchema.parse(request.body)) });
  });
  router.put('/overrides/:date', async (request, response) => {
    const date = dateSchema.parse(request.params.date);
    const input = z.object({ plannedAmount: planMoneySchema, note: z.string().trim().max(500).nullable().optional() }).parse(request.body);
    response.json({ success: true, data: await store.saveOverride({ date, plannedAmount: input.plannedAmount, note: input.note ?? null }) });
  });
  router.delete('/overrides/:date', async (request, response) => {
    const date = dateSchema.parse(request.params.date);
    response.json({ success: true, data: { deleted: await store.deleteOverride(date) } });
  });
  router.put('/days/:date/record-zero', async (request, response) => {
    const date = dateSchema.parse(request.params.date);
    const { recorded } = z.object({ recorded: z.boolean() }).parse(request.body);
    response.json({ success: true, data: { recorded: await store.setRecordedZero(date, recorded) } });
  });
  router.post('/expenses', async (request, response) => {
    const input = expenseSchema.parse(request.body);
    await validateCategory(input.expenseDate, input.budgetCategory);
    response.status(201).json({ success: true, data: await store.createExpense(input) });
  });
  router.put('/expenses/:id', async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const input = expenseSchema.omit({ idempotencyKey: true }).parse(request.body);
    await validateCategory(input.expenseDate, input.budgetCategory);
    const record = await store.updateExpense(id, input);
    if (!record) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    response.json({ success: true, data: record });
  });
  router.delete('/expenses/:id', async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    if (!(await store.deleteExpense(id))) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    response.json({ success: true, data: { deleted: true } });
  });
  return router;
}
