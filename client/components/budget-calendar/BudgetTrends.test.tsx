// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  BudgetCalendarReportSummary,
  BudgetCalendarTrends,
} from '../../../shared/budget-calendar';
import { BudgetTrends } from './BudgetTrends';

const summary: BudgetCalendarReportSummary = {
  month: '2026-10', monthlyBudget: '10000.00', actualSpending: '4250.00',
  remaining: '5750.00', utilization: '42.50', recordedDayAverage: '531.25',
  projectedMonthEnd: '16468.75', overBudgetDays: 2, underBudgetDays: 5,
  onBudgetDays: 1, recordedDays: 8,
  week: {
    from: '2026-10-05', to: '2026-10-11', planned: '1400.00', actual: '1250.00',
    remaining: '150.00', overBudgetDays: 1,
  },
  planningDiscrepancy: {
    mealAllocation: '5280.00', weeklyFoodTarget: '1900.00', fourWeekTarget: '7600.00',
    difference: '2320.00', hasDiscrepancy: true,
  },
};

const trends: BudgetCalendarTrends = {
  month: '2026-10', today: '2026-10-09',
  daily: [
    {
      date: '2026-10-07', planned: '200.00', actual: '0.00', recordState: 'missing',
      cumulativePlanned: '200.00', cumulativeActual: '0.00',
    },
    {
      date: '2026-10-08', planned: '200.00', actual: '0.00', recordState: 'recorded_zero',
      cumulativePlanned: '400.00', cumulativeActual: '0.00',
    },
    {
      date: '2026-10-09', planned: '200.00', actual: '250.00', recordState: 'recorded_with_expenses',
      cumulativePlanned: '600.00', cumulativeActual: '250.00',
    },
  ],
  categories: [
    { categoryId: '1', name: 'Food', amount: '3000.00', percentage: '70.59' },
    { categoryId: '2', name: 'Petrol', amount: '1250.00', percentage: '29.41' },
  ],
  weeks: [
    { from: '2026-09-28', to: '2026-10-04', planned: '800.00', actual: '1000.00' },
    { from: '2026-10-05', to: '2026-10-11', planned: '1400.00', actual: '1250.00' },
  ],
};

afterEach(cleanup);

describe('BudgetTrends', () => {
  it('renders persisted metrics and keeps missing days distinct from recorded zero', () => {
    render(<BudgetTrends summary={summary} trends={trends} />);

    expect(screen.getByText('₹10,000.00')).toBeVisible();
    expect(screen.getAllByText('₹4,250.00')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Monthly budget utilization' }))
      .toHaveAttribute('aria-valuenow', '42.5');
    expect(screen.getByText(/Projected month end.*₹16,468\.75/i)).toBeVisible();

    const daily = screen.getByRole('table', { name: 'Daily planned and actual spending data' });
    expect(within(daily).getByText('Not recorded')).toBeVisible();
    expect(within(daily).getByText('₹0.00 recorded')).toBeVisible();
    expect(within(daily).getByText('₹250.00')).toBeVisible();
  });

  it('provides accessible equivalents for all persisted charts', () => {
    render(<BudgetTrends summary={summary} trends={trends} />);

    expect(screen.getByRole('img', { name: 'Planned versus actual spending by day' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Spending by category' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Weekly planned versus actual spending' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Cumulative planned and actual spending' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Category spending data' })).toHaveTextContent('Food');
    expect(screen.getByRole('table', { name: 'Weekly planned and actual spending data' })).toHaveTextContent('September 28');
    expect(screen.getByRole('table', { name: 'Weekly planned and actual spending data' })).toHaveTextContent('month portion');
  });
});
