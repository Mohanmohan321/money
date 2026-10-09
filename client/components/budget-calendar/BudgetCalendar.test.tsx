// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BudgetCalendarDay, BudgetCalendarMonthView } from '../../../shared/budget-calendar';
import { BudgetCalendar } from './BudgetCalendar';

function day(date: string, overrides: Partial<BudgetCalendarDay> = {}): BudgetCalendarDay {
  return {
    date, plannedAmount: '200.00', planSource: 'calculated', actualAmount: '0.00',
    remaining: '200.00', variance: '-200.00', utilization: '0.00', status: 'missing',
    recordState: 'missing', expenses: [], ...overrides,
  };
}

const view: BudgetCalendarMonthView = {
  month: '2026-10', today: '2026-10-09',
  days: [
    day('2026-10-01'),
    day('2026-10-09'),
    day('2026-10-10', {
      actualAmount: '250.00', remaining: '-50.00', variance: '50.00', utilization: '125.00',
      status: 'over', recordState: 'recorded_with_expenses',
    }),
    day('2026-10-11', { status: 'future' }),
  ],
  summary: {
    monthlyBudget: '10000.00', actualSpending: '250.00', remaining: '9750.00',
    utilization: '2.50', recordedDayAverage: '250.00', overBudgetDays: 1,
    underBudgetDays: 0, onBudgetDays: 0, recordedDays: 1,
  },
};

afterEach(cleanup);

describe('BudgetCalendar', () => {
  it('renders compact non-color status labels and selects the exact local date', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    render(<BudgetCalendar
      view={view}
      selectedDate="2026-10-09"
      onMonthChange={vi.fn()}
      onSelectDate={onSelectDate}
    />);

    const grid = screen.getByRole('grid', { name: 'October 2026 Budget Calendar' });
    expect(within(grid).getAllByTestId('budget-calendar-blank')).toHaveLength(3);
    expect(within(grid).getByRole('button', {
      name: /October 9, 2026.*planned 200\.00.*actual not recorded/i,
    })).toHaveAttribute('aria-pressed', 'true');
    const over = within(grid).getByRole('button', {
      name: /October 10, 2026.*actual 250\.00.*over budget/i,
    });
    expect(over).toHaveTextContent('Over');
    await user.click(over);
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-10');
  });

  it('navigates months and Today without UTC conversion', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    const onSelectDate = vi.fn();
    render(<BudgetCalendar
      view={view}
      onMonthChange={onMonthChange}
      onSelectDate={onSelectDate}
    />);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onMonthChange.mock.calls).toEqual([['2026-09'], ['2026-11'], ['2026-10']]);
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-09');
  });
});
