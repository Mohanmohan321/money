// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetCalendarPage } from './BudgetCalendarPage';

const view = {
  month: '2026-10', today: '2026-10-09', days: [],
  summary: {
    monthlyBudget: '10000.00', actualSpending: '0.00', remaining: '10000.00',
    utilization: '0.00', recordedDayAverage: '0.00', overBudgetDays: 0,
    underBudgetDays: 0, onBudgetDays: 0, recordedDays: 0,
  },
};

function response(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T06:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('BudgetCalendarPage', () => {
  it('loads the isolated calendar and exposes keyboard-operable internal tabs', async () => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      paths.push(path);
      if (path.endsWith('/calendar')) return response(view);
      if (path.endsWith('/categories?includeArchived=true')) return response({ items: [] });
      if (path.endsWith('/settings')) return response({
        weekStart: 1, weeklyFoodTarget: '1900.00',
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      });
      if (path.endsWith('/rules')) return response({ items: [] });
      if (path.endsWith('/summary')) return response({
        month: '2026-10', ...view.summary, projectedMonthEnd: '0.00',
        week: {
          from: '2026-10-05', to: '2026-10-11', planned: '0.00', actual: '0.00',
          remaining: '0.00', overBudgetDays: 0,
        },
        planningDiscrepancy: {
          mealAllocation: '5280.00', weeklyFoodTarget: '1900.00',
          fourWeekTarget: '7600.00', difference: '2320.00', hasDiscrepancy: true,
        },
      });
      if (path.endsWith('/trends')) return response({
        month: '2026-10', today: '2026-10-09', daily: [], categories: [], weeks: [],
      });
      if (path.endsWith('/months/2026-10')) return response({
        month: '2026-10', overallLimit: '10000.00', categories: [],
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      });
      return response({});
    }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BudgetCalendarPage />);

    expect(await screen.findByRole('heading', { name: 'Budget Calendar' })).toBeVisible();
    const calendar = screen.getByRole('tab', { name: 'Calendar' });
    const trends = screen.getByRole('tab', { name: 'Trends' });
    const categories = screen.getByRole('tab', { name: 'Categories' });
    const rules = screen.getByRole('tab', { name: 'Rules' });
    expect(calendar).toHaveAttribute('aria-selected', 'true');
    calendar.focus();
    await user.keyboard('{ArrowRight}');
    expect(trends).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(categories).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(rules).toHaveFocus();
    expect(paths).toEqual(expect.arrayContaining([
      '/api/budget-calendar/months/2026-10/calendar',
      '/api/budget-calendar/months/2026-10',
      '/api/budget-calendar/categories?includeArchived=true',
      '/api/budget-calendar/settings',
      '/api/budget-calendar/rules',
      '/api/budget-calendar/months/2026-10/summary',
      '/api/budget-calendar/months/2026-10/trends',
    ]));
    expect(paths.some((path) => /api\/(history|analysis|transactions)/.test(path))).toBe(false);
  });
});
