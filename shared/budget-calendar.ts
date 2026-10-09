import { z } from 'zod';

import { localDateSchema, moneySchema, monthSchema, planMoneySchema } from './contracts';

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export const budgetCalendarDateSchema = localDateSchema.refine(isValidCalendarDate, {
  message: 'Date must be a valid calendar date',
});

export const budgetCalendarGroupSchema = z.enum([
  'grocery', 'meal', 'petrol', 'snacks', 'miscellaneous', 'other',
]);

export const budgetCalendarFrequencySchema = z.enum([
  'daily', 'weekly', 'monthly', 'specific_days',
]);

const categoryNameSchema = z.string().trim().min(1, 'Category name is required').max(80);
const optionalDescriptionSchema = z.string().trim().max(200).optional();
const optionalNotesSchema = z.string().trim().max(500).optional();

export const createBudgetCalendarCategorySchema = z.object({
  name: categoryNameSchema,
  group: budgetCalendarGroupSchema,
  monthlyAmount: planMoneySchema,
  includedInOverallBudget: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export const updateBudgetCalendarCategorySchema = createBudgetCalendarCategorySchema.extend({
  active: z.boolean().optional(),
});

export const createBudgetCalendarExpenseSchema = z.object({
  expenseDate: budgetCalendarDateSchema,
  categoryId: z.string().uuid(),
  amount: moneySchema,
  description: optionalDescriptionSchema,
  notes: optionalNotesSchema,
  idempotencyKey: z.string().uuid(),
});

export const updateBudgetCalendarExpenseSchema = createBudgetCalendarExpenseSchema
  .omit({ idempotencyKey: true });

export const createBudgetCalendarRuleSchema = z.object({
  categoryId: z.string().uuid(),
  frequency: budgetCalendarFrequencySchema,
  amount: planMoneySchema,
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  activeFrom: budgetCalendarDateSchema.optional(),
  activeTo: budgetCalendarDateSchema.optional(),
}).superRefine((value, context) => {
  if ((value.frequency === 'weekly' || value.frequency === 'specific_days')
    && value.weekdays.length === 0) {
    context.addIssue({
      code: 'custom', path: ['weekdays'], message: 'At least one weekday is required',
    });
  }
  if (value.frequency === 'monthly' && value.dayOfMonth === undefined) {
    context.addIssue({
      code: 'custom', path: ['dayOfMonth'], message: 'Day of month is required',
    });
  }
  if (value.activeFrom && value.activeTo && value.activeFrom > value.activeTo) {
    context.addIssue({
      code: 'custom', path: ['activeTo'], message: 'Active end must be on or after start',
    });
  }
});

export const updateBudgetCalendarRuleSchema = createBudgetCalendarRuleSchema;

export const updateBudgetCalendarSettingsSchema = z.object({
  weekStart: z.number().int().min(1).max(7),
  weeklyFoodTarget: planMoneySchema,
});

export const updateBudgetCalendarMonthSchema = z.object({
  overallLimit: planMoneySchema,
  categories: z.array(z.object({
    categoryId: z.string().uuid(),
    name: categoryNameSchema,
    group: budgetCalendarGroupSchema,
    monthlyAmount: planMoneySchema,
    includedInOverallBudget: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })).min(1),
});

export const upsertBudgetCalendarOverrideSchema = z.object({
  plannedAmount: planMoneySchema,
  note: z.string().trim().max(500).optional(),
});

export const setBudgetCalendarDayRecordSchema = z.object({ recordedZero: z.boolean() });
export const budgetCalendarMonthSchema = monthSchema;

export type BudgetCalendarGroup = z.infer<typeof budgetCalendarGroupSchema>;
export type BudgetCalendarFrequency = z.infer<typeof budgetCalendarFrequencySchema>;
export type CreateBudgetCalendarCategoryInput = z.infer<typeof createBudgetCalendarCategorySchema>;
export type UpdateBudgetCalendarCategoryInput = z.infer<typeof updateBudgetCalendarCategorySchema>;
export type CreateBudgetCalendarExpenseInput = z.infer<typeof createBudgetCalendarExpenseSchema>;
export type UpdateBudgetCalendarExpenseInput = z.infer<typeof updateBudgetCalendarExpenseSchema>;
export type CreateBudgetCalendarRuleInput = z.infer<typeof createBudgetCalendarRuleSchema>;
export type UpdateBudgetCalendarRuleInput = z.infer<typeof updateBudgetCalendarRuleSchema>;
export type UpdateBudgetCalendarSettingsInput = z.infer<typeof updateBudgetCalendarSettingsSchema>;
export type UpdateBudgetCalendarMonthInput = z.infer<typeof updateBudgetCalendarMonthSchema>;
export type UpsertBudgetCalendarOverrideInput = z.infer<typeof upsertBudgetCalendarOverrideSchema>;

export interface BudgetCalendarSettings {
  weekStart: number;
  weeklyFoodTarget: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCalendarCategory {
  id: string;
  seedKey?: string;
  name: string;
  group: BudgetCalendarGroup;
  monthlyAmount: string;
  includedInOverallBudget: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCalendarMonthCategory {
  categoryId: string;
  name: string;
  group: BudgetCalendarGroup;
  monthlyAmount: string;
  includedInOverallBudget: boolean;
  sortOrder: number;
}

export interface BudgetCalendarMonthConfiguration {
  month: string;
  overallLimit: string;
  categories: BudgetCalendarMonthCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCalendarRule {
  id: string;
  categoryId: string;
  frequency: BudgetCalendarFrequency;
  amount: string;
  weekdays: number[];
  dayOfMonth?: number;
  activeFrom?: string;
  activeTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCalendarOverride {
  date: string;
  plannedAmount: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetCalendarExpense {
  id: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  description?: string;
  notes?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export type BudgetCalendarDayStatus = 'missing' | 'under' | 'on' | 'over' | 'future';
export type BudgetCalendarRecordState = 'missing' | 'recorded_zero' | 'recorded_with_expenses';

export interface BudgetCalendarDay {
  date: string;
  plannedAmount: string;
  planSource: 'calculated' | 'override';
  actualAmount: string;
  remaining: string;
  variance: string;
  utilization: string | null;
  status: BudgetCalendarDayStatus;
  recordState: BudgetCalendarRecordState;
  expenses: BudgetCalendarExpense[];
}

export interface BudgetCalendarSummary {
  monthlyBudget: string;
  actualSpending: string;
  remaining: string;
  utilization: string | null;
  recordedDayAverage: string;
  projectedMonthEnd?: string;
  overBudgetDays: number;
  underBudgetDays: number;
  onBudgetDays: number;
  recordedDays: number;
}

export interface BudgetCalendarMonthView {
  month: string;
  today: string;
  days: BudgetCalendarDay[];
  summary: BudgetCalendarSummary;
}

export interface BudgetCalendarTrends {
  month: string;
  today: string;
  daily: Array<{
    date: string;
    planned: string;
    actual: string;
    recordState: BudgetCalendarRecordState;
    cumulativePlanned: string;
    cumulativeActual: string;
  }>;
  categories: Array<{ categoryId: string; name: string; amount: string; percentage: string }>;
  weeks: Array<{ from: string; to: string; planned: string; actual: string }>;
}

export interface BudgetCalendarWeekSummary {
  from: string;
  to: string;
  planned: string;
  actual: string;
  remaining: string;
  overBudgetDays: number;
}

export interface BudgetCalendarPlanningDiscrepancy {
  mealAllocation: string;
  weeklyFoodTarget: string;
  fourWeekTarget: string;
  difference: string;
  hasDiscrepancy: boolean;
}

export interface BudgetCalendarReportSummary extends BudgetCalendarSummary {
  month: string;
  week: BudgetCalendarWeekSummary;
  planningDiscrepancy: BudgetCalendarPlanningDiscrepancy;
}

export const budgetCalendarSummaryQuerySchema = z.object({
  week: budgetCalendarDateSchema.optional(),
});
