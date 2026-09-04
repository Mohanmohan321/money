// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DashboardData,
  MonthlyAnalysisData,
  NetWorthSummary,
  Vault,
} from '../../shared/contracts';
import { api } from '../api';
import { DashboardPage } from './DashboardPage';

const dashboard: DashboardData = {
  timezone: 'Asia/Kolkata',
  today: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25',
    transactionCount: 1, lendingCount: 1, borrowingCount: 1,
  },
  week: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25', recordCount: 3,
    daily: [],
  },
  month: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25', recordCount: 3,
    daily: [],
  },
};

const monthly: MonthlyAnalysisData = {
  month: '2026-09',
  budget: {
    month: '2026-09', salary: '55000.00', spendingLimit: '10000.00',
    savingsTarget: '12000.00', source: 'suggested',
  },
  summary: {
    income: '55000.00', spending: '9000.00', savings: '10000.00',
    amountLeft: '36000.00', budgetScore: '18.18', spendingRemaining: '1000.00',
  },
  categories: [],
  weekFrom: '2026-08-31',
  weekTo: '2026-09-06',
  week: [],
  recentActivity: [],
};

const netWorth: NetWorthSummary = {
  manualAssets: '300000.00',
  receivables: '20000.00',
  totalOwned: '320000.00',
  manualLiabilities: '90000.00',
  borrowedDebt: '10000.00',
  totalOwed: '100000.00',
  netWorth: '220000.00',
  status: 'positive',
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dashboardWithTransactions(totalTransactions: string): DashboardData {
  return {
    ...dashboard,
    today: { ...dashboard.today, totalTransactions },
  };
}

function monthlyWithIncome(income: string): MonthlyAnalysisData {
  return {
    ...monthly,
    summary: { ...monthly.summary, income },
  };
}

function renderDashboard() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DashboardPage request ordering', () => {
  it('keeps the newest grouped result and alert state when an older retry finishes last', async () => {
    const older = {
      dashboard: deferred<DashboardData>(),
      monthly: deferred<MonthlyAnalysisData>(),
      netWorth: deferred<NetWorthSummary>(),
      vaults: deferred<{ items: Vault[] }>(),
    };
    const newest = {
      dashboard: deferred<DashboardData>(),
      monthly: deferred<MonthlyAnalysisData>(),
      netWorth: deferred<NetWorthSummary>(),
      vaults: deferred<{ items: Vault[] }>(),
    };
    vi.spyOn(api, 'dashboard')
      .mockResolvedValueOnce(dashboard)
      .mockReturnValueOnce(older.dashboard.promise)
      .mockReturnValueOnce(newest.dashboard.promise);
    vi.spyOn(api, 'monthlyAnalysis')
      .mockResolvedValueOnce(monthly)
      .mockReturnValueOnce(older.monthly.promise)
      .mockReturnValueOnce(newest.monthly.promise);
    vi.spyOn(api, 'netWorth')
      .mockRejectedValueOnce(new Error('initial partial failure'))
      .mockReturnValueOnce(older.netWorth.promise)
      .mockReturnValueOnce(newest.netWorth.promise);
    vi.spyOn(api, 'vaults')
      .mockResolvedValueOnce({ items: [] })
      .mockReturnValueOnce(older.vaults.promise)
      .mockReturnValueOnce(newest.vaults.promise);

    const user = userEvent.setup();
    renderDashboard();
    const retry = await screen.findByRole('button', { name: 'Refresh and try again' });
    await user.click(retry);
    await user.click(retry);

    await act(async () => {
      newest.dashboard.resolve(dashboardWithTransactions('333.00'));
      newest.monthly.resolve(monthlyWithIncome('57000.00'));
      newest.netWorth.resolve({ ...netWorth, netWorth: '230000.00' });
      newest.vaults.resolve({ items: [] });
    });
    await waitFor(() => expect(screen.getByText('333.00')).toBeVisible());
    expect(screen.getByRole('region', { name: 'Monthly budget' })).toHaveTextContent('57,000.00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      older.dashboard.resolve(dashboardWithTransactions('222.00'));
      older.monthly.resolve(monthlyWithIncome('56000.00'));
      older.netWorth.reject(new Error('older partial failure'));
      older.vaults.resolve({ items: [] });
    });
    await act(async () => Promise.resolve());

    expect(screen.getByText('333.00')).toBeVisible();
    expect(screen.queryByText('222.00')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Monthly budget' })).toHaveTextContent('57,000.00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not let an older grouped monthly result replace a saved-budget refetch or alert', async () => {
    const retry = {
      dashboard: deferred<DashboardData>(),
      monthly: deferred<MonthlyAnalysisData>(),
      netWorth: deferred<NetWorthSummary>(),
      vaults: deferred<{ items: Vault[] }>(),
    };
    vi.spyOn(api, 'dashboard').mockResolvedValueOnce(dashboard).mockReturnValueOnce(retry.dashboard.promise);
    vi.spyOn(api, 'monthlyAnalysis')
      .mockResolvedValueOnce(monthly)
      .mockReturnValueOnce(retry.monthly.promise)
      .mockResolvedValueOnce(monthlyWithIncome('56000.00'));
    vi.spyOn(api, 'netWorth')
      .mockRejectedValueOnce(new Error('initial partial failure'))
      .mockReturnValueOnce(retry.netWorth.promise);
    vi.spyOn(api, 'vaults').mockResolvedValueOnce({ items: [] }).mockReturnValueOnce(retry.vaults.promise);
    vi.spyOn(api, 'saveBudget').mockResolvedValue({ ...monthly.budget, source: 'saved' });

    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: 'Refresh and try again' }));
    await user.click(screen.getByRole('button', { name: 'Edit monthly budget' }));
    await user.clear(screen.getByLabelText('Monthly salary'));
    await user.type(screen.getByLabelText('Monthly salary'), '56000');
    await user.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Monthly budget' })).toHaveTextContent('56,000.00');
    });

    await act(async () => {
      retry.dashboard.resolve(dashboardWithTransactions('222.00'));
      retry.monthly.reject(new Error('older monthly failure'));
      retry.netWorth.resolve(netWorth);
      retry.vaults.resolve({ items: [] });
    });
    await act(async () => Promise.resolve());

    const budget = screen.getByRole('region', { name: 'Monthly budget' });
    const incomeMetric = within(budget).getByText('Income').parentElement;
    expect(incomeMetric).toHaveTextContent('56,000.00');
    expect(incomeMetric).not.toHaveTextContent('55,000.00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not inspect or commit a grouped result after unmount', async () => {
    const pending = {
      dashboard: deferred<DashboardData>(),
      monthly: deferred<MonthlyAnalysisData>(),
      netWorth: deferred<NetWorthSummary>(),
      vaults: deferred<{ items: Vault[] }>(),
    };
    vi.spyOn(api, 'dashboard').mockReturnValue(pending.dashboard.promise);
    vi.spyOn(api, 'monthlyAnalysis').mockReturnValue(pending.monthly.promise);
    vi.spyOn(api, 'netWorth').mockReturnValue(pending.netWorth.promise);
    vi.spyOn(api, 'vaults').mockReturnValue(pending.vaults.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let itemsRead = 0;
    const vaultResult = {
      get items(): Vault[] {
        itemsRead += 1;
        return [];
      },
    };

    const { unmount } = renderDashboard();
    unmount();
    await act(async () => {
      pending.dashboard.resolve(dashboard);
      pending.monthly.resolve(monthly);
      pending.netWorth.resolve(netWorth);
      pending.vaults.resolve(vaultResult);
    });
    await act(async () => Promise.resolve());

    expect(itemsRead).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
