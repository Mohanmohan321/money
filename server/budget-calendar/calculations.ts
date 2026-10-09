import Decimal from 'decimal.js';

import type {
  BudgetCalendarDay,
  BudgetCalendarDayStatus,
  BudgetCalendarExpense,
  BudgetCalendarOverride,
  BudgetCalendarRule,
  BudgetCalendarSummary,
} from '../../shared/budget-calendar';

export interface DayBudgetInput {
  planned: string;
  actual: string;
  recorded: boolean;
  future: boolean;
}

export interface DayBudgetResult {
  remaining: string;
  variance: string;
  utilization: string | null;
  status: BudgetCalendarDayStatus;
}

export interface PlannedDay {
  date: string;
  plannedAmount: string;
  planSource: 'calculated' | 'override';
}

export function calculateDayBudget(input: DayBudgetInput): DayBudgetResult {
  const planned = new Decimal(input.planned);
  const actual = new Decimal(input.actual);
  const remaining = planned.minus(actual);
  const variance = actual.minus(planned);
  const status: BudgetCalendarDayStatus = input.future ? 'future'
    : !input.recorded ? 'missing'
    : actual.lt(planned) ? 'under'
    : actual.eq(planned) ? 'on'
    : 'over';
  return {
    remaining: remaining.toFixed(2),
    variance: variance.toFixed(2),
    utilization: planned.eq(0)
      ? (actual.eq(0) ? '0.00' : null)
      : actual.div(planned).times(100).toFixed(2),
    status,
  };
}

export function monthDates(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const finalDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: finalDay }, (_, index) => (
    `${month}-${String(index + 1).padStart(2, '0')}`
  ));
}

function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function appliesOnDate(rule: BudgetCalendarRule, date: string): boolean {
  if (rule.activeFrom && date < rule.activeFrom) return false;
  if (rule.activeTo && date > rule.activeTo) return false;
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'monthly') return Number(date.slice(-2)) === rule.dayOfMonth;
  return rule.weekdays.includes(isoWeekday(date));
}

export function buildPlannedDays(input: {
  month: string;
  rules: BudgetCalendarRule[];
  overrides: Array<Pick<BudgetCalendarOverride, 'date' | 'plannedAmount'>>;
}): PlannedDay[] {
  const overrideMap = new Map(input.overrides.map((override) => [override.date, override.plannedAmount]));
  return monthDates(input.month).map((date) => {
    const override = overrideMap.get(date);
    if (override !== undefined) {
      return { date, plannedAmount: new Decimal(override).toFixed(2), planSource: 'override' };
    }
    const planned = input.rules.reduce(
      (total, rule) => appliesOnDate(rule, date) ? total.plus(rule.amount) : total,
      new Decimal(0),
    );
    return { date, plannedAmount: planned.toFixed(2), planSource: 'calculated' };
  });
}

export function aggregateBudgetMonth(input: {
  month: string;
  today: string;
  overallLimit: string;
  plannedDays: PlannedDay[];
  expenses: BudgetCalendarExpense[];
  recordedZeroDates: Set<string>;
}): { days: BudgetCalendarDay[]; summary: BudgetCalendarSummary } {
  const expensesByDate = new Map<string, BudgetCalendarExpense[]>();
  for (const expense of input.expenses) {
    const items = expensesByDate.get(expense.expenseDate) ?? [];
    items.push(expense);
    expensesByDate.set(expense.expenseDate, items);
  }

  const days = input.plannedDays.map((planned): BudgetCalendarDay => {
    const expenses = expensesByDate.get(planned.date) ?? [];
    const actual = expenses.reduce((total, expense) => total.plus(expense.amount), new Decimal(0));
    const recordState = expenses.length > 0
      ? 'recorded_with_expenses' as const
      : input.recordedZeroDates.has(planned.date)
        ? 'recorded_zero' as const
        : 'missing' as const;
    const result = calculateDayBudget({
      planned: planned.plannedAmount,
      actual: actual.toFixed(2),
      recorded: recordState !== 'missing',
      future: planned.date > input.today,
    });
    return {
      ...planned,
      actualAmount: actual.toFixed(2),
      ...result,
      recordState,
      expenses,
    };
  });

  const actualSpending = days.reduce((total, day) => total.plus(day.actualAmount), new Decimal(0));
  const monthlyBudget = new Decimal(input.overallLimit);
  const recordedElapsed = days.filter((day) => day.date <= input.today && day.recordState !== 'missing');
  const recordedTotal = recordedElapsed.reduce((total, day) => total.plus(day.actualAmount), new Decimal(0));
  const recordedDayAverage = recordedElapsed.length === 0
    ? new Decimal(0)
    : recordedTotal.div(recordedElapsed.length);
  const projectedMonthEnd = recordedElapsed.length === 0
    ? undefined
    : recordedDayAverage.times(days.length).toFixed(2);

  return {
    days,
    summary: {
      monthlyBudget: monthlyBudget.toFixed(2),
      actualSpending: actualSpending.toFixed(2),
      remaining: monthlyBudget.minus(actualSpending).toFixed(2),
      utilization: monthlyBudget.eq(0)
        ? (actualSpending.eq(0) ? '0.00' : null)
        : actualSpending.div(monthlyBudget).times(100).toFixed(2),
      recordedDayAverage: recordedDayAverage.toFixed(2),
      ...(projectedMonthEnd ? { projectedMonthEnd } : {}),
      overBudgetDays: days.filter((day) => day.status === 'over').length,
      underBudgetDays: days.filter((day) => day.status === 'under').length,
      onBudgetDays: days.filter((day) => day.status === 'on').length,
      recordedDays: recordedElapsed.length,
    },
  };
}

export function calculatePlanningDiscrepancy(mealAllocation: string, weeklyFoodTarget: string) {
  const allocation = new Decimal(mealAllocation);
  const target = new Decimal(weeklyFoodTarget);
  const fourWeekTarget = target.times(4);
  const difference = fourWeekTarget.minus(allocation);
  return {
    mealAllocation: allocation.toFixed(2),
    weeklyFoodTarget: target.toFixed(2),
    fourWeekTarget: fourWeekTarget.toFixed(2),
    difference: difference.toFixed(2),
    hasDiscrepancy: !difference.eq(0),
  };
}
