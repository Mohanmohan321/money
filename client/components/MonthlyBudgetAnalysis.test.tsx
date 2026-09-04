// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MonthlyAnalysisData, SpendingCategory } from '../../shared/contracts';
import { MonthlyBudgetAnalysis } from './MonthlyBudgetAnalysis';

const categories: SpendingCategory[] = [
  'food', 'travel', 'shopping', 'coffee', 'entertainment', 'health', 'bills', 'other',
];

const fixture: MonthlyAnalysisData = {
  month: '2026-09',
  budget: { month: '2026-09', salary: '50000.00', spendingLimit: '20000.00', savingsTarget: '10000.00', source: 'saved' },
  summary: { income: '55000.00', spending: '20000.00', savings: '12000.00', amountLeft: '23000.00', budgetScore: '21.82', spendingRemaining: '0.00' },
  categories: categories.map((category, index) => ({ category, amount: index === 0 ? '12000.00' : '1000.00', percentage: index === 0 ? '60.00' : '5.00' })),
  weekFrom: '2026-08-31',
  weekTo: '2026-09-06',
  week: [
    { date: '2026-08-31', income: '0.00', spending: '0.00', savings: '0.00', activity: [] },
    { date: '2026-09-01', income: '0.00', spending: '1200.00', savings: '0.00', activity: [{ id: 't1', type: 'transaction', description: 'Swiggy dinner', category: 'food', amount: '1200.00', createdAt: '2026-09-01T12:00:00Z' }] },
    { date: '2026-09-02', income: '0.00', spending: '200.00', savings: '0.00', activity: [] },
    { date: '2026-09-03', income: '0.00', spending: '300.00', savings: '0.00', activity: [] },
    { date: '2026-09-04', income: '0.00', spending: '400.00', savings: '0.00', activity: [] },
    { date: '2026-09-05', income: '0.00', spending: '500.00', savings: '0.00', activity: [] },
    { date: '2026-09-06', income: '0.00', spending: '600.00', savings: '0.00', activity: [] },
  ],
  recentActivity: [],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function installApi() {
  const paths: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    paths.push(path);
    return new Response(JSON.stringify({ success: true, data: fixture }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return paths;
}

describe('MonthlyBudgetAnalysis', () => {
  it('shows server totals, every category, Monday-Sunday bars, and expandable day activity', async () => {
    installApi();
    const user = userEvent.setup();
    render(<MonthlyBudgetAnalysis initialMonth="2026-09" />);

    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeVisible();
    expect(screen.getByText('Total spending')).toBeVisible();
    expect(screen.getByText('20,000.00')).toBeVisible();
    expect(screen.getByText('Budget Score')).toBeVisible();
    expect(screen.getByText('21.82%')).toBeVisible();
    for (const category of categories) expect(screen.getByTestId(`category-spend-${category}`)).toHaveClass(`category-${category}`);
    expect(screen.getByTestId('category-spend-food')).toHaveTextContent('12,000.00');
    expect(screen.getByTestId('category-spend-food')).toHaveTextContent('60.00%');

    const tracker = screen.getByRole('region', { name: 'Weekly expense tracker' });
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(within(tracker).getByText(day)).toBeVisible();
    }
    expect(within(tracker).getByText('0.00')).toBeVisible();
    await user.click(within(tracker).getByRole('button', { name: /Tuesday 1 September.*1,200\.00/i }));
    expect(within(tracker).getByText('Swiggy dinner')).toBeVisible();
  });

  it('queries previous and next months and navigates weeks from server boundaries', async () => {
    const paths = installApi();
    const user = userEvent.setup();
    render(<MonthlyBudgetAnalysis initialMonth="2026-09" />);
    await screen.findByRole('heading', { name: 'September 2026' });

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(paths.some((path) => path.includes('month=2026-08'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(paths.filter((path) => path.includes('month=2026-09')).length).toBeGreaterThan(1));
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(paths.some((path) => path.includes('week=2026-09-07'))).toBe(true));
  });
});
