import { z } from 'zod';

const plainMoneyPattern = /^\d+(?:\.\d{1,2})?$/;

function normalizeMoney(value: string): string {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '');
  return `${normalizedInteger}.${fractionalPart.padEnd(2, '0')}`;
}

export const moneySchema = z
  .string({ error: 'Amount must be a decimal string' })
  .trim()
  .refine((value) => plainMoneyPattern.test(value), {
    message: 'Amount must be a positive number with at most 2 decimal places',
  })
  .transform(normalizeMoney)
  .refine((value) => value !== '0.00', {
    message: 'Amount must be greater than zero',
  })
  .refine((value) => value.split('.')[0].length <= 18, {
    message: 'Amount is too large',
  });

const descriptionSchema = z
  .string({ error: 'Description is required' })
  .trim()
  .min(1, 'Description is required')
  .max(200, 'Description must be 200 characters or fewer');

export const spendingCategorySchema = z.enum([
  'food', 'travel', 'shopping', 'coffee', 'entertainment', 'health', 'bills', 'other',
]);

const personNameSchema = z
  .string({ error: 'Person name is required' })
  .trim()
  .min(1, 'Person name is required')
  .max(100, 'Person name must be 100 characters or fewer');

export const loginSchema = z.object({
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(1024, 'Password is too long'),
});

export const createTransactionSchema = z.object({
  description: descriptionSchema,
  amount: moneySchema,
  category: spendingCategorySchema.optional(),
});

export const incomeCategorySchema = z.enum(['bonus', 'freelance', 'refund', 'other']);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM');
export const planMoneySchema = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/)
  .transform(normalizeMoney).refine((value) => value.split('.')[0].length <= 18, 'Amount is too large');
export const upsertBudgetSchema = z.object({ salary: planMoneySchema, spendingLimit: planMoneySchema, savingsTarget: planMoneySchema });
export const createIncomeSchema = z.object({ source: descriptionSchema, category: incomeCategorySchema, amount: moneySchema });

export const createPersonRecordSchema = z.object({
  personName: personNameSchema,
  amount: moneySchema,
});

export const recordTypeSchema = z.enum(['transaction', 'lent', 'borrowed']);

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD');

const vaultTargetDateSchema = localDateSchema
  .refine(isCalendarDate, 'Date must be a valid calendar date');

export const createVaultSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().min(1).max(16),
  targetAmount: moneySchema,
  targetDate: vaultTargetDateSchema.optional(),
});

export const createVaultContributionSchema = z.object({ amount: moneySchema });

export const dateFilterSchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: '`from` must be on or before `to`',
  });

export const historyQuerySchema = dateFilterSchema.and(
  z.object({
    type: recordTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  }),
);

export const analyticsQuerySchema = dateFilterSchema.and(
  z.object({
    period: z.enum(['day', 'week', 'month', 'year']).default('month'),
  }),
);

export type RecordType = z.infer<typeof recordTypeSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreatePersonRecordInput = z.infer<typeof createPersonRecordSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type SpendingCategory = z.infer<typeof spendingCategorySchema>;
export type IncomeCategory = z.infer<typeof incomeCategorySchema>;
export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type CreateVaultInput = z.infer<typeof createVaultSchema>;
export type CreateVaultContributionInput = z.infer<typeof createVaultContributionSchema>;

export interface TransactionRecord {
  id: string;
  description: string;
  category: SpendingCategory;
  amount: string;
  createdAt: string;
}

export interface MonthlyBudget {
  month: string;
  salary: string;
  spendingLimit: string;
  savingsTarget: string;
  source: 'saved' | 'suggested';
  updatedAt?: string;
}

export interface IncomeRecord {
  id: string;
  source: string;
  category: IncomeCategory;
  amount: string;
  createdAt: string;
}

export interface Vault {
  id: string;
  name: string;
  emoji: string;
  targetAmount: string;
  targetDate?: string;
  status: 'active' | 'archived';
  savedAmount: string;
  progressPercent: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultContribution {
  id: string;
  vaultId: string;
  amount: string;
  createdAt: string;
}

export interface BudgetSummary {
  income: string;
  spending: string;
  savings: string;
  amountLeft: string;
  budgetScore: string;
  spendingRemaining: string;
}

export interface PersonRecord {
  id: string;
  personName: string;
  amount: string;
  createdAt: string;
}

export type HistoryItem =
  | (TransactionRecord & { type: 'transaction' })
  | (PersonRecord & { type: 'lent' | 'borrowed' });

export interface MovementPoint {
  date: string;
  transactionAmount: string;
  lentAmount: string;
  borrowedAmount: string;
}

export interface CategoryStatistics {
  totalAmount: string;
  count: number;
  averageAmount: string;
  largestAmount: string;
  smallestAmount?: string;
}

export interface PersonSummary {
  personName: string;
  totalAmount: string;
  count: number;
}

export interface TodayDashboard {
  totalTransactions: string;
  totalLent: string;
  totalBorrowed: string;
  transactionCount: number;
  lendingCount: number;
  borrowingCount: number;
}

export interface PeriodDashboard {
  totalTransactions: string;
  totalLent: string;
  totalBorrowed: string;
  recordCount: number;
  daily: MovementPoint[];
}

export interface DashboardData {
  timezone: string;
  today: TodayDashboard;
  week: PeriodDashboard;
  month: PeriodDashboard;
}

export interface LendingPersonSummary {
  personName: string;
  totalAmount: string;
  numberOfLoans: number;
}

export interface BorrowingPersonSummary {
  personName: string;
  totalAmount: string;
  numberOfBorrowings: number;
}

export interface AnalyticsData {
  period: 'day' | 'week' | 'month' | 'year';
  timezone: string;
  from: string;
  to: string;
  movement: MovementPoint[];
  transactions: CategoryStatistics;
  lending: Omit<CategoryStatistics, 'smallestAmount'>;
  borrowing: Omit<CategoryStatistics, 'smallestAmount'>;
  lendingByPerson: LendingPersonSummary[];
  borrowingByPerson: BorrowingPersonSummary[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    message: string;
    code: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
