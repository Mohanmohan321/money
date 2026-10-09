// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BudgetCalendarCategory, BudgetCalendarDay } from '../../../shared/budget-calendar';
import { api } from '../../api';
import { BudgetDayEditor } from './BudgetDayEditor';

const category: BudgetCalendarCategory = {
  id: '00000000-0000-4000-8000-000000000101', name: 'Lunch', group: 'meal',
  monthlyAmount: '2400.00', includedInOverallBudget: true, active: true, sortOrder: 10,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

const day: BudgetCalendarDay = {
  date: '2026-10-09', plannedAmount: '200.00', planSource: 'calculated', actualAmount: '0.00',
  remaining: '200.00', variance: '-200.00', utilization: '0.00', status: 'missing',
  recordState: 'missing', expenses: [],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('BudgetDayEditor', () => {
  it('previews exact overspending and saves once while the request is pending', async () => {
    let resolve!: (value: typeof day.expenses[number]) => void;
    const pending = new Promise<typeof day.expenses[number]>((innerResolve) => { resolve = innerResolve; });
    const create = vi.spyOn(api, 'createBudgetCalendarExpense').mockReturnValue(pending);
    const user = userEvent.setup();
    render(<BudgetDayEditor day={day} categories={[category]} onClose={vi.fn()} onMutationComplete={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Expense category'), category.id);
    await user.type(screen.getByLabelText('Actual spending'), '250');
    expect(screen.getByText('Over budget by ₹50.00')).toBeVisible();
    expect(screen.getByText('125.00% utilized')).toBeVisible();
    const save = screen.getByRole('button', { name: 'Save expense' });
    await user.click(save);
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({
      expenseDate: '2026-10-09', categoryId: category.id, amount: '250',
    }));

    resolve({
      id: '00000000-0000-4000-8000-000000000301', expenseDate: day.date,
      categoryId: category.id, categoryName: category.name, amount: '250.00',
      idempotencyKey: create.mock.calls[0][0].idempotencyKey,
      createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Expense saved');
  });

  it('records explicit zero and supports editing and deleting existing entries', async () => {
    const recordedDay: BudgetCalendarDay = {
      ...day,
      actualAmount: '150.00', remaining: '50.00', variance: '-50.00', utilization: '75.00',
      status: 'under', recordState: 'recorded_with_expenses',
      expenses: [{
        id: '00000000-0000-4000-8000-000000000301', expenseDate: day.date,
        categoryId: category.id, categoryName: category.name, amount: '150.00',
        description: 'Lunch', idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
        createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z',
      }],
    };
    vi.spyOn(api, 'updateBudgetCalendarExpense').mockResolvedValue(recordedDay.expenses[0]);
    vi.spyOn(api, 'deleteBudgetCalendarExpense').mockResolvedValue({ deleted: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refreshed = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <BudgetDayEditor day={recordedDay} categories={[category]} onClose={vi.fn()} onMutationComplete={refreshed} />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit Lunch expense' }));
    expect(screen.getByLabelText('Actual spending')).toHaveValue('150.00');
    await user.clear(screen.getByLabelText('Actual spending'));
    await user.type(screen.getByLabelText('Actual spending'), '175');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(api.updateBudgetCalendarExpense).toHaveBeenCalledWith(recordedDay.expenses[0].id, expect.objectContaining({ amount: '175' }));

    await user.click(screen.getByRole('button', { name: 'Delete Lunch expense' }));
    expect(api.deleteBudgetCalendarExpense).toHaveBeenCalledWith(recordedDay.expenses[0].id);

    vi.spyOn(api, 'setBudgetCalendarDayRecord').mockResolvedValue({ date: day.date, recordState: 'recorded_zero' });
    rerender(<BudgetDayEditor day={day} categories={[category]} onClose={vi.fn()} onMutationComplete={refreshed} />);
    await user.click(screen.getByRole('button', { name: 'Record ₹0 spent' }));
    expect(api.setBudgetCalendarDayRecord).toHaveBeenCalledWith(day.date, true);
  });

  it('closes from the keyboard without saving', async () => {
    const close = vi.fn();
    const user = userEvent.setup();
    render(<BudgetDayEditor day={day} categories={[category]} onClose={close} onMutationComplete={vi.fn()} />);

    screen.getByLabelText('Actual spending').focus();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
