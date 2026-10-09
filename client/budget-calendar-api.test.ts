import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './api';

function successResponse(data: unknown = {}) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Budget Calendar API client', () => {
  it('uses only dedicated read endpoints', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      successResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.budgetCalendarMonth('2026-10');
    await api.budgetCalendarView('2026-10');
    await api.budgetCalendarSummary('2026-10', '2026-10-09');
    await api.budgetCalendarTrends('2026-10');
    await api.budgetCalendarCategories();
    await api.budgetCalendarSettings();
    await api.budgetCalendarRules();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/budget-calendar/months/2026-10',
      '/api/budget-calendar/months/2026-10/calendar',
      '/api/budget-calendar/months/2026-10/summary?week=2026-10-09',
      '/api/budget-calendar/months/2026-10/trends',
      '/api/budget-calendar/categories',
      '/api/budget-calendar/settings',
      '/api/budget-calendar/rules',
    ]);
  });

  it('sends expense mutations only to dedicated endpoints', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      successResponse());
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      expenseDate: '2026-10-09', categoryId: '00000000-0000-4000-8000-000000000101',
      amount: '250', description: 'Lunch',
      idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
    };

    await api.createBudgetCalendarExpense(input);
    await api.updateBudgetCalendarExpense('00000000-0000-4000-8000-000000000301', {
      expenseDate: input.expenseDate, categoryId: input.categoryId, amount: '200', notes: 'Edited',
    });
    await api.deleteBudgetCalendarExpense('00000000-0000-4000-8000-000000000301');
    await api.setBudgetCalendarDayRecord('2026-10-09', true);

    expect(fetchMock.mock.calls.map(([path, init]) => ({
      path,
      method: init?.method,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }))).toEqual([
      { path: '/api/budget-calendar/expenses', method: 'POST', body: input },
      {
        path: '/api/budget-calendar/expenses/00000000-0000-4000-8000-000000000301',
        method: 'PUT',
        body: {
          expenseDate: '2026-10-09', categoryId: input.categoryId, amount: '200', notes: 'Edited',
        },
      },
      {
        path: '/api/budget-calendar/expenses/00000000-0000-4000-8000-000000000301',
        method: 'DELETE', body: undefined,
      },
      {
        path: '/api/budget-calendar/days/2026-10-09/record-state', method: 'PUT',
        body: { recordedZero: true },
      },
    ]);
  });
});
