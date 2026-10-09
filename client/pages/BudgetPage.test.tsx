// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BUDGET_SETTINGS, buildBudgetMonth } from '../../shared/budget-workspace';
import { BudgetPage } from './BudgetPage';

const apiMock = vi.hoisted(() => ({
  budgetWorkspace: vi.fn(), createBudgetExpense: vi.fn(), updateBudgetExpense: vi.fn(),
  deleteBudgetExpense: vi.fn(), recordZeroBudgetDay: vi.fn(), saveBudgetSettings: vi.fn(),
  saveBudgetOverride: vi.fn(), deleteBudgetOverride: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock, ApiError: class ApiError extends Error {} }));

function workspace(actual = '0.00') {
  return buildBudgetMonth({
    month: '2026-10', today: '2026-10-09', settings: DEFAULT_BUDGET_SETTINGS,
    overrides: [{ date: '2026-10-09', plannedAmount: '200.00', note: null }], explicitZeroDates: [],
    expenses: actual === '0.00' ? [] : [{ id: '39bd18d1-1111-4111-8111-111111111111', expenseDate: '2026-10-09', amount: actual, budgetCategory: 'lunch', description: 'Lunch', notes: null, createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' }],
  });
}

describe('BudgetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T08:00:00+05:30'));
    apiMock.budgetWorkspace.mockResolvedValue(workspace());
    apiMock.createBudgetExpense.mockResolvedValue({});
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('renders persisted summaries, selects the exact local date, and refreshes after save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    apiMock.budgetWorkspace.mockResolvedValueOnce(workspace()).mockResolvedValueOnce(workspace('250.00'));
    render(<BudgetPage />);

    expect(await screen.findByRole('heading', { name: 'Budget overview' })).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Monthly budget summary' })).getAllByText('₹10,000.00')[0]).toBeVisible();
    await user.click(screen.getByRole('button', { name: /October 9, 2026.*planned ₹200.00/i }));
    expect(screen.getByRole('dialog', { name: 'October 9, 2026 expenses' })).toBeVisible();
    await user.type(screen.getByLabelText('Amount'), '250');
    await user.selectOptions(screen.getByLabelText('Expense category'), 'lunch');
    await user.type(screen.getByLabelText('Description'), 'Lunch');
    await user.click(screen.getByRole('button', { name: 'Save expense' }));

    expect(apiMock.createBudgetExpense).toHaveBeenCalledWith(expect.objectContaining({ expenseDate: '2026-10-09', amount: '250', budgetCategory: 'lunch' }));
    await waitFor(() => expect(apiMock.budgetWorkspace).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Over budget by ₹50.00')).toBeVisible();
  });

  it('supports month navigation, explicit zero, configuration totals, and accessible trend text', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BudgetPage />);
    await screen.findByText('October 2026');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(apiMock.budgetWorkspace).toHaveBeenLastCalledWith('2026-09', '2026-10-09');

    await user.click(screen.getByRole('tab', { name: 'Trends' }));
    expect(screen.getByRole('region', { name: 'Planned versus actual spending' })).toBeVisible();
    expect(screen.getByText('No actual spending has been recorded for this month.')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Configuration' }));
    expect(screen.getByText('₹10,000.00 allocated')).toBeVisible();
    expect(screen.getByText(/weekly food target.*does not match/i)).toBeVisible();
  });
});
