// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnnualReportData } from '../../shared/contracts';
import { AnnualReport } from './AnnualReport';

const months = Array.from({ length: 12 }, (_, index) => ({
  month: `2026-${String(index + 1).padStart(2, '0')}`,
  income: index === 8 ? '9007199254740993.50' : '5000.00',
  spending: index === 8 ? '4500.00' : '1200.00', savings: '500.00', amountLeft: '3300.00', budgetUsage: '40.00',
}));

const fixture: AnnualReportData = {
  year: '2026',
  summary: { income: '60000.00', spending: '14400.00', savings: '6000.00', amountLeft: '39600.00', budgetScore: '10.00', spendingRemaining: '0.00' },
  months,
  spendingByCategory: [{ category: 'food', amount: '10000.00', percentage: '69.44' }, { category: 'travel', amount: '4400.00', percentage: '30.56' }],
  incomeBySource: [{ source: 'Salary', amount: '55000.00', percentage: '91.67' }, { source: 'Freelance', amount: '5000.00', percentage: '8.33' }],
  highestSpendingMonth: '2026-09', bestSavingMonth: '2026-01',
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function installApi(data: AnnualReportData = fixture) {
  const paths: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    paths.push(String(input));
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return paths;
}

describe('AnnualReport', () => {
  it('renders annual server totals, accessible charts, legends, visible data tables, and extrema', async () => {
    installApi();
    render(<AnnualReport initialYear="2026" />);

    expect(await screen.findByRole('heading', { name: '2026 annual report' })).toBeVisible();
    for (const label of ['Annual income', 'Annual spending', 'Annual savings', 'Annual amount left', 'Budget Score']) expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole('img', { name: 'Monthly income versus spending chart' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Monthly savings trend' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Spending by category pie chart' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Income by source pie chart' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Monthly income and spending data' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Monthly savings data' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Spending by category data' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Income by source data' })).toBeVisible();
    expect(within(screen.getByRole('table', { name: 'Monthly income and spending data' })).getByText(/(?:9,007,199,254,740,993|9,00,71,99,25,47,40,993)\.50/)).toBeVisible();
    expect(screen.getByText('Highest-spending month: September')).toBeVisible();
    expect(screen.getByText('Best-saving month: January')).toBeVisible();
  });

  it('navigates years and presents zero-state pies and no activity', async () => {
    const zero = { ...fixture, spendingByCategory: [], incomeBySource: [], highestSpendingMonth: undefined, bestSavingMonth: undefined };
    const paths = installApi(zero);
    const user = userEvent.setup();
    render(<AnnualReport initialYear="2026" />);
    await screen.findByRole('heading', { name: '2026 annual report' });
    expect(within(screen.getByRole('img', { name: 'Spending by category pie chart' })).getByText('No data')).toBeVisible();
    expect(within(screen.getByRole('img', { name: 'Income by source pie chart' })).getByText('No data')).toBeVisible();
    expect(screen.getAllByText('No activity recorded')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Previous year' }));
    await waitFor(() => expect(paths.some((path) => path.includes('year=2025'))).toBe(true));
  });
});
