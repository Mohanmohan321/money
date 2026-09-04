// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BudgetBreakdownData } from '../../shared/contracts';
import { BudgetBreakdown } from './BudgetBreakdown';

const months = Array.from({ length: 12 }, (_, index) => ({
  month: `2026-${String(index + 1).padStart(2, '0')}`,
  income: '5000.00', spending: '1200.00', savings: '500.00', amountLeft: '3300.00', budgetUsage: index === 8 ? '125.00' : '40.00',
}));

const fixture: BudgetBreakdownData = {
  year: '2026', selectedMonth: '2026-09', months,
  days: [{
    date: '2026-09-03', income: '5000.00', spending: '1200.00', savings: '500.00',
    vaultContributionCount: 1, subscriptionPaymentCount: 2,
    activity: [
      { id: 'i1', type: 'income', source: 'Freelance site', category: 'freelance', amount: '5000.00', createdAt: '2026-09-03T08:00:00Z' },
      { id: 't1', type: 'transaction', description: 'Swiggy dinner', category: 'food', amount: '1200.00', createdAt: '2026-09-03T12:00:00Z' },
    ],
  }],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function installApi() {
  const paths: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    paths.push(String(input));
    return new Response(JSON.stringify({ success: true, data: fixture }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return paths;
}

describe('BudgetBreakdown', () => {
  it('renders a 12-month rail, semantic calendar, markers, and selected-day details in mobile DOM order', async () => {
    installApi();
    const user = userEvent.setup();
    render(<BudgetBreakdown initialYear="2026" initialMonth="2026-09" />);

    expect(await screen.findByRole('heading', { name: '2026 budgeting breakdown' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /budget$/i })).toHaveLength(12);
    const september = screen.getByRole('button', { name: /September.*budget/i });
    expect(september).toHaveTextContent('Income');
    expect(september).toHaveTextContent('Spending');
    expect(september).toHaveTextContent('Savings');
    expect(september).toHaveTextContent('Amount left');
    expect(september).toHaveTextContent('125.00%');
    expect(within(september).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    const calendar = screen.getByRole('grid', { name: 'September 2026 budget calendar' });
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) expect(within(calendar).getByText(day)).toBeVisible();
    expect(within(calendar).getAllByTestId('calendar-blank')).toHaveLength(1);
    const day = within(calendar).getByRole('button', { name: /3 September 2026.*income 5,000\.00.*expenses 1,200\.00.*1 Vault.*2 subscriptions/i });
    expect(within(day).getByTitle('Vault contribution')).toBeVisible();
    expect(within(day).getByTitle('Subscription payments')).toBeVisible();
    await user.click(day);
    const details = screen.getByRole('region', { name: '3 September details' });
    expect(within(details).getByText('Freelance site')).toBeVisible();
    expect(within(details).getByText('Swiggy dinner')).toBeVisible();
    expect(within(details).getByTestId('category-food')).toBeVisible();
    expect(screen.getByTestId('breakdown-summary').compareDocumentPosition(calendar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(calendar.compareDocumentPosition(details)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('refetches for month and year navigation and renders real leap days', async () => {
    const paths = installApi();
    const user = userEvent.setup();
    render(<BudgetBreakdown initialYear="2026" initialMonth="2026-09" />);
    await screen.findByRole('heading', { name: '2026 budgeting breakdown' });
    await user.click(screen.getByRole('button', { name: /February.*budget/i }));
    await waitFor(() => expect(paths.some((path) => path.includes('month=2026-02'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Previous year' }));
    await waitFor(() => expect(paths.some((path) => path.includes('year=2025'))).toBe(true));
    await user.clear(screen.getByLabelText('Report year'));
    await user.type(screen.getByLabelText('Report year'), '2024');
    await user.click(screen.getByRole('button', { name: 'Load year' }));
    expect(await screen.findByRole('button', { name: /29 February 2024/i })).toBeVisible();
  });
});
