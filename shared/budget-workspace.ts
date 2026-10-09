export type BudgetGroup = 'grocery' | 'meal' | 'petrol' | 'snacks' | 'miscellaneous' | 'other';
export type AllocationSchedule = 'daily' | 'weekdays' | 'monthly' | 'unassigned';

export interface BudgetCategoryConfig {
  id: string;
  name: string;
  group: BudgetGroup;
  monthlyAmount: string;
  includedInOverallBudget: boolean;
  schedule: AllocationSchedule;
  weekdays: number[];
  active: boolean;
}

export interface BudgetSettings {
  overallMonthlyLimit: string;
  weeklyFoodTarget: string;
  weekStart: 1;
  categories: BudgetCategoryConfig[];
}

export interface BudgetExpense {
  id: string;
  expenseDate: string;
  amount: string;
  budgetCategory: string;
  description: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetDateOverride { date: string; plannedAmount: string; note: string | null }

export type BudgetStatus = 'missing' | 'under' | 'on' | 'over' | 'future';
export type BudgetRecordState = 'missing' | 'recorded_zero' | 'recorded_with_expenses';

export interface BudgetDay {
  date: string;
  planned: string;
  actual: string;
  remaining: string;
  variance: string;
  utilization: string | null;
  status: BudgetStatus;
  recordState: BudgetRecordState;
  plannedSource: 'automatic' | 'override';
  overrideNote: string | null;
  expenses: BudgetExpense[];
}

export interface BudgetWeek {
  from: string;
  to: string;
  planned: string;
  actual: string;
  remaining: string;
  overBudgetDays: number;
}

export interface BudgetMonthWorkspace {
  month: string;
  settings: BudgetSettings;
  days: BudgetDay[];
  weeks: BudgetWeek[];
  categoryTotals: Array<{ categoryId: string; name: string; amount: string; percentage: string }>;
  summary: {
    monthlyBudget: string;
    planned: string;
    actual: string;
    remaining: string;
    utilization: string | null;
    dailyRecordedAverage: string;
    overBudgetDays: number;
    underBudgetDays: number;
    recordedDays: number;
    projectedMonthEnd: string | null;
    weeklyFoodDiscrepancy: boolean;
  };
}

const category = (
  id: string, name: string, group: BudgetGroup, monthlyAmount: string,
  schedule: AllocationSchedule = 'unassigned',
): BudgetCategoryConfig => ({
  id, name, group, monthlyAmount, schedule, weekdays: [], active: true,
  includedInOverallBudget: true,
});

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  overallMonthlyLimit: '10000.00',
  weeklyFoodTarget: '1900.00',
  weekStart: 1,
  categories: [
    category('bananas', 'Bananas', 'grocery', '300.00'),
    category('dates', 'Dates', 'grocery', '300.00'),
    category('milk', 'Milk', 'grocery', '300.00'),
    category('eggs', 'Eggs', 'grocery', '420.00'),
    category('oats', 'Oats', 'grocery', '350.00'),
    category('peanut-butter', 'Peanut butter', 'grocery', '350.00'),
    category('breakfast', 'Breakfast', 'meal', '480.00', 'daily'),
    category('lunch', 'Lunch', 'meal', '2400.00', 'daily'),
    category('dinner', 'Dinner', 'meal', '2400.00', 'daily'),
    category('petrol', 'Petrol', 'petrol', '500.00'),
    category('snacks', 'Snacks', 'snacks', '1200.00'),
    category('miscellaneous', 'Miscellaneous', 'miscellaneous', '1000.00'),
  ],
};

function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid money value: ${value}`);
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -amount : amount;
}

function money(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function percentage(numerator: bigint, denominator: bigint): string | null {
  if (denominator === 0n) return numerator === 0n ? '0.00' : null;
  const scaled = numerator * 10_000n;
  const rounded = (scaled + denominator / 2n) / denominator;
  return `${rounded / 100n}.${(rounded % 100n).toString().padStart(2, '0')}`;
}

export function calculateBudgetPosition(input: { planned: string; actual: string; recorded: boolean }) {
  const planned = cents(input.planned);
  const actual = cents(input.actual);
  const variance = actual - planned;
  return {
    remaining: money(planned - actual),
    variance: money(variance),
    utilization: percentage(actual, planned),
    status: (!input.recorded ? 'missing' : actual < planned ? 'under' : actual === planned ? 'on' : 'over') as Exclude<BudgetStatus, 'future'>,
  };
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateString(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`;
}

function shiftDate(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateString(date);
}

export function monthDates(month: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Month must use YYYY-MM');
  const [year, monthNumber] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function occurrenceDates(category: BudgetCategoryConfig, dates: string[]): string[] {
  if (!category.active || category.schedule === 'unassigned') return [];
  if (category.schedule === 'monthly') return dates.slice(0, 1);
  if (category.schedule === 'daily') return dates;
  return dates.filter((date) => category.weekdays.includes(parseDate(date).getUTCDay() || 7));
}

function automaticPlans(settings: BudgetSettings, dates: string[]): Map<string, bigint> {
  const result = new Map(dates.map((date) => [date, 0n]));
  for (const item of settings.categories) {
    const occurrences = occurrenceDates(item, dates);
    if (occurrences.length === 0) continue;
    const total = cents(item.monthlyAmount);
    const base = total / BigInt(occurrences.length);
    let remainder = total % BigInt(occurrences.length);
    for (const date of occurrences) {
      const extra = remainder > 0n ? 1n : 0n;
      result.set(date, (result.get(date) ?? 0n) + base + extra);
      if (remainder > 0n) remainder -= 1n;
    }
  }
  return result;
}

function weekStart(date: string): string {
  const weekday = parseDate(date).getUTCDay() || 7;
  return shiftDate(date, 1 - weekday);
}

export function buildBudgetMonth(input: {
  month: string;
  today: string;
  settings: BudgetSettings;
  overrides: BudgetDateOverride[];
  explicitZeroDates: string[];
  expenses: BudgetExpense[];
}): BudgetMonthWorkspace {
  const dates = monthDates(input.month);
  const plans = automaticPlans(input.settings, dates);
  const overrides = new Map(input.overrides.map((item) => [item.date, item]));
  const explicitZero = new Set(input.explicitZeroDates);
  const expensesByDate = new Map<string, BudgetExpense[]>();
  for (const expense of input.expenses) {
    const existing = expensesByDate.get(expense.expenseDate) ?? [];
    existing.push(expense);
    expensesByDate.set(expense.expenseDate, existing);
  }

  const days = dates.map((date): BudgetDay => {
    const dayExpenses = expensesByDate.get(date) ?? [];
    const actual = dayExpenses.reduce((sum, item) => sum + cents(item.amount), 0n);
    const override = overrides.get(date);
    const planned = override ? cents(override.plannedAmount) : (plans.get(date) ?? 0n);
    const recordState: BudgetRecordState = dayExpenses.length > 0 ? 'recorded_with_expenses' : explicitZero.has(date) ? 'recorded_zero' : 'missing';
    const position = calculateBudgetPosition({ planned: money(planned), actual: money(actual), recorded: recordState !== 'missing' });
    return {
      date, planned: money(planned), actual: money(actual), ...position,
      status: date > input.today ? 'future' : position.status,
      recordState, plannedSource: override ? 'override' : 'automatic',
      overrideNote: override?.note ?? null, expenses: dayExpenses,
    };
  });

  const groupedWeeks = new Map<string, BudgetDay[]>();
  for (const day of days) {
    const from = weekStart(day.date);
    groupedWeeks.set(from, [...(groupedWeeks.get(from) ?? []), day]);
  }
  const weeks = [...groupedWeeks].map(([from, weekDays]): BudgetWeek => {
    const planned = weekDays.reduce((sum, day) => sum + cents(day.planned), 0n);
    const actual = weekDays.reduce((sum, day) => sum + cents(day.actual), 0n);
    return { from, to: shiftDate(from, 6), planned: money(planned), actual: money(actual), remaining: money(planned - actual), overBudgetDays: weekDays.filter((day) => day.status === 'over').length };
  });

  const actual = days.reduce((sum, day) => sum + cents(day.actual), 0n);
  const planned = days.reduce((sum, day) => sum + cents(day.planned), 0n);
  const limit = cents(input.settings.overallMonthlyLimit);
  const recordedElapsed = days.filter((day) => day.date <= input.today && day.recordState !== 'missing');
  const categoryById = new Map(input.settings.categories.map((item) => [item.id, item]));
  const categorySums = new Map<string, bigint>();
  for (const expense of input.expenses) categorySums.set(expense.budgetCategory, (categorySums.get(expense.budgetCategory) ?? 0n) + cents(expense.amount));
  const categoryTotals = [...categorySums].map(([categoryId, amount]) => ({
    categoryId, name: categoryById.get(categoryId)?.name ?? 'Other', amount: money(amount), percentage: percentage(amount, actual) ?? '0.00',
  }));
  const mealAllocation = input.settings.categories.filter((item) => item.group === 'meal' && item.includedInOverallBudget).reduce((sum, item) => sum + cents(item.monthlyAmount), 0n);
  const weeklyReference = cents(input.settings.weeklyFoodTarget) * 4n;
  const elapsedDays = dates.filter((date) => date <= input.today).length;
  const projected = recordedElapsed.length === 0 || elapsedDays === 0 ? null : actual * BigInt(dates.length) / BigInt(recordedElapsed.length);

  return {
    month: input.month, settings: input.settings, days, weeks, categoryTotals,
    summary: {
      monthlyBudget: money(limit), planned: money(planned), actual: money(actual), remaining: money(limit - actual), utilization: percentage(actual, limit),
      dailyRecordedAverage: money(recordedElapsed.length ? actual / BigInt(recordedElapsed.length) : 0n),
      overBudgetDays: days.filter((day) => day.status === 'over').length,
      underBudgetDays: days.filter((day) => day.status === 'under').length,
      recordedDays: recordedElapsed.length,
      projectedMonthEnd: projected === null ? null : money(projected),
      weeklyFoodDiscrepancy: weeklyReference !== mealAllocation,
    },
  };
}
