// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BudgetCalendarCategory,
  BudgetCalendarMonthCategory,
} from '../../../shared/budget-calendar';
import { api } from '../../api';
import { BudgetConfiguration } from './BudgetConfiguration';

const amounts = [
  ['Bananas', 'grocery', '300.00'], ['Dates', 'grocery', '300.00'],
  ['Milk', 'grocery', '300.00'], ['Eggs', 'grocery', '420.00'],
  ['Oats', 'grocery', '350.00'], ['Peanut butter', 'grocery', '350.00'],
  ['Breakfast', 'meal', '480.00'], ['Lunch', 'meal', '2400.00'],
  ['Dinner', 'meal', '2400.00'], ['Petrol', 'petrol', '500.00'],
  ['Snacks', 'snacks', '1200.00'], ['Miscellaneous', 'miscellaneous', '1000.00'],
] as const;

const categories: BudgetCalendarCategory[] = amounts.map(([name, group, monthlyAmount], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name, group, monthlyAmount, includedInOverallBudget: true, active: true,
  sortOrder: (index + 1) * 10,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}));

const snapshot: BudgetCalendarMonthCategory[] = categories.map((category) => ({
  categoryId: category.id, name: category.name, group: category.group,
  monthlyAmount: category.monthlyAmount,
  includedInOverallBudget: category.includedInOverallBudget,
  sortOrder: category.sortOrder,
}));

beforeEach(() => {
  vi.spyOn(api, 'budgetCalendarMonth').mockResolvedValue({
    month: '2026-10', overallLimit: '10000.00', categories: snapshot,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  });
  vi.spyOn(api, 'budgetCalendarCategories').mockResolvedValue({ items: categories });
  vi.spyOn(api, 'budgetCalendarSettings').mockResolvedValue({
    weekStart: 1, weeklyFoodTarget: '1900.00',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  });
  vi.spyOn(api, 'budgetCalendarRules').mockResolvedValue({ items: [] });
  vi.spyOn(api, 'saveBudgetCalendarMonth').mockImplementation(async (month, input) => ({
    month, ...input, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z',
  }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('BudgetConfiguration', () => {
  it('shows exact seeded totals and saves an edited selected-month snapshot', async () => {
    const save = vi.mocked(api.saveBudgetCalendarMonth);
    const user = userEvent.setup();
    render(<BudgetConfiguration month="2026-10" section="categories" onMutationComplete={vi.fn()} />);

    expect(await screen.findByText('₹10,000.00 allocated')).toBeVisible();
    expect(screen.getByText('Groceries ₹2,020.00')).toBeVisible();
    expect(screen.getByText('Meals ₹5,280.00')).toBeVisible();
    const lunch = screen.getByLabelText('Monthly amount for Lunch');
    await user.clear(lunch);
    await user.type(lunch, '2300');
    expect(screen.getByText('₹9,900.00 allocated')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save October allocation' }));
    expect(save).toHaveBeenCalledWith('2026-10', expect.objectContaining({
      overallLimit: '10000.00',
      categories: expect.arrayContaining([expect.objectContaining({ name: 'Lunch', monthlyAmount: '2300' })]),
    }));
  });

  it('warns about the independent weekly target and saves settings without changing allocations', async () => {
    const save = vi.spyOn(api, 'updateBudgetCalendarSettings').mockResolvedValue({
      weekStart: 7, weeklyFoodTarget: '2000.00',
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<BudgetConfiguration month="2026-10" section="rules" onMutationComplete={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/weekly food target.*₹1,900\.00.*meal allocation.*₹5,280\.00/i);
    await user.selectOptions(screen.getByLabelText('Week starts on'), '7');
    await user.clear(screen.getByLabelText('Weekly food target'));
    await user.type(screen.getByLabelText('Weekly food target'), '2000');
    await user.click(screen.getByRole('button', { name: 'Save planning settings' }));
    expect(save).toHaveBeenCalledWith({ weekStart: 7, weeklyFoodTarget: '2000' });
    expect(api.saveBudgetCalendarMonth).not.toHaveBeenCalled();
  });

  it('adds a new category to the current month draft without mutating the saved snapshot', async () => {
    const created: BudgetCalendarCategory = {
      id: '00000000-0000-4000-8000-000000000099', name: 'Coffee', group: 'other',
      monthlyAmount: '600.00', includedInOverallBudget: true, active: true, sortOrder: 130,
      createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z',
    };
    const create = vi.spyOn(api, 'createBudgetCalendarCategory').mockResolvedValue(created);
    const user = userEvent.setup();
    render(<BudgetConfiguration month="2026-10" section="categories" onMutationComplete={vi.fn()} />);

    await screen.findByText('₹10,000.00 allocated');
    await user.type(screen.getByLabelText('Category name'), 'Coffee');
    await user.selectOptions(screen.getByLabelText('Group'), 'other');
    await user.type(screen.getByLabelText('Monthly amount'), '600');
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByLabelText('Monthly amount for Coffee')).toHaveValue('600.00');
    expect(screen.getByText('₹10,600.00 allocated')).toBeVisible();
    expect(api.saveBudgetCalendarMonth).not.toHaveBeenCalled();
  });

  it('previews and saves a date override through the isolated endpoint', async () => {
    const save = vi.spyOn(api, 'saveBudgetCalendarOverride').mockResolvedValue({
      date: '2026-10-09', plannedAmount: '200.00', note: 'Special plan',
    });
    const user = userEvent.setup();
    render(<BudgetConfiguration month="2026-10" section="rules" onMutationComplete={vi.fn()} />);

    await screen.findByText(/Planning rules/i);
    await user.type(screen.getByLabelText('Override date'), '2026-10-09');
    await user.type(screen.getByLabelText('Override planned amount'), '200');
    await user.type(screen.getByLabelText('Override note'), 'Special plan');
    expect(screen.getByText('October 9 will use ₹200.00 instead of its calculated plan.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save date override' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('2026-10-09', {
      plannedAmount: '200', note: 'Special plan',
    }));
  });
});
