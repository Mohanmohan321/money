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
      paths.push(String(input));
      return response(view);
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
    expect(paths).toEqual(['/api/budget-calendar/months/2026-10/calendar']);
    expect(paths.some((path) => /api\/(history|analysis|transactions)/.test(path))).toBe(false);
  });
});
