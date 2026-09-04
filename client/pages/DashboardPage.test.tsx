// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AssetRecord,
  DashboardData,
  LiabilityRecord,
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

const trip: Vault = {
  id: 'trip', name: 'Trip', emoji: '✈️', isGeneral: false,
  targetAmount: '60000.00', targetDate: '2027-01-15', status: 'active',
  savedAmount: '15000.00', progressPercent: '25.00',
  createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-02T08:00:00.000Z',
};

const asset: AssetRecord = {
  id: 'asset-1', name: 'Savings account', type: 'bank', currentValue: '125000.00',
  createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-02T08:00:00.000Z',
};

const liability: LiabilityRecord = {
  id: 'liability-1', name: 'Home loan', type: 'mortgage', outstandingBalance: '750000.00',
  createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-02T08:00:00.000Z',
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
  vi.spyOn(api, 'subscriptions').mockResolvedValue({ items: [], confirmedMonthlyForecast: '0.00' });
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

describe('DashboardPage Vault and net worth controls', () => {
  function installDashboardSpies() {
    vi.spyOn(api, 'dashboard').mockResolvedValue(dashboard);
    vi.spyOn(api, 'monthlyAnalysis').mockResolvedValue(monthly);
    vi.spyOn(api, 'netWorth').mockResolvedValue(netWorth);
    vi.spyOn(api, 'vaults').mockResolvedValue({ items: [trip] });
  }

  it('places Vault goals after recent transactions and refreshes Vaults plus monthly analysis after contribution', async () => {
    installDashboardSpies();
    vi.spyOn(api, 'contributeToVault').mockResolvedValue({
      id: 'contribution', vaultId: 'trip', amount: '5000.00', createdAt: '2026-09-04T08:00:00.000Z',
    });
    const user = userEvent.setup();
    renderDashboard();

    const recent = await screen.findByRole('heading', { name: 'Recent transactions' });
    const vaults = screen.getByRole('heading', { name: 'Vault goals' });
    const today = screen.getByRole('heading', { name: "Today's snapshot" });
    expect(recent.compareDocumentPosition(vaults)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(vaults.compareDocumentPosition(today)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await user.click(screen.getByRole('button', { name: 'Add money to Trip' }));
    await user.type(screen.getByLabelText('Contribution for Trip'), '5000');
    await user.click(screen.getByRole('button', { name: 'Add to Trip' }));

    await waitFor(() => expect(api.vaults).toHaveBeenCalledTimes(2));
    expect(api.monthlyAnalysis).toHaveBeenCalledTimes(2);
    expect(api.netWorth).toHaveBeenCalledTimes(1);
    expect(api.dashboard).toHaveBeenCalledTimes(1);
    const contributionOrder = vi.mocked(api.contributeToVault).mock.invocationCallOrder[0];
    const vaultRefreshOrder = vi.mocked(api.vaults).mock.invocationCallOrder[1];
    expect(contributionOrder).toBeLessThan(vaultRefreshOrder);
  });

  it('refreshes only Vaults after creating a goal', async () => {
    installDashboardSpies();
    vi.spyOn(api, 'createVault').mockResolvedValue(trip);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'New Vault' }));
    await user.type(screen.getByLabelText('Goal name'), 'Phone');
    await user.type(screen.getByLabelText('Goal emoji'), '📱');
    await user.type(screen.getByLabelText('Target amount'), '80000');
    await user.click(screen.getByRole('button', { name: 'Create Vault' }));

    await waitFor(() => expect(api.vaults).toHaveBeenCalledTimes(2));
    expect(api.monthlyAnalysis).toHaveBeenCalledTimes(1);
    expect(api.netWorth).toHaveBeenCalledTimes(1);
    expect(api.dashboard).toHaveBeenCalledTimes(1);
  });

  it('opens manual records from Net Worth and refreshes Net Worth only after an asset mutation', async () => {
    installDashboardSpies();
    vi.spyOn(api, 'assets').mockResolvedValue({ items: [asset] });
    vi.spyOn(api, 'liabilities').mockResolvedValue({ items: [liability] });
    vi.spyOn(api, 'createAsset').mockResolvedValue({ ...asset, id: 'asset-2', name: 'Cash' });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Manage assets and liabilities' }));
    expect(await screen.findByRole('heading', { name: 'Assets' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Liabilities' })).toBeVisible();
    expect(api.assets).toHaveBeenCalledTimes(1);
    expect(api.liabilities).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Asset name'), 'Cash');
    await user.type(screen.getByLabelText('Current value'), '5000');
    await user.click(screen.getByRole('button', { name: 'Add asset' }));

    await waitFor(() => expect(api.netWorth).toHaveBeenCalledTimes(2));
    expect(api.assets).toHaveBeenCalledTimes(1);
    expect(api.liabilities).toHaveBeenCalledTimes(1);
    expect(api.vaults).toHaveBeenCalledTimes(1);
    expect(api.monthlyAnalysis).toHaveBeenCalledTimes(1);
    expect(api.dashboard).toHaveBeenCalledTimes(1);
  });

  it('does not let a grouped retry overwrite a newer contribution refresh', async () => {
    const retry = {
      dashboard: deferred<DashboardData>(),
      monthly: deferred<MonthlyAnalysisData>(),
      netWorth: deferred<NetWorthSummary>(),
      vaults: deferred<{ items: Vault[] }>(),
    };
    const refreshedTrip = { ...trip, savedAmount: '20000.00', progressPercent: '33.33' };
    vi.spyOn(api, 'dashboard').mockResolvedValueOnce(dashboard).mockReturnValueOnce(retry.dashboard.promise);
    vi.spyOn(api, 'monthlyAnalysis')
      .mockResolvedValueOnce(monthly)
      .mockReturnValueOnce(retry.monthly.promise)
      .mockResolvedValueOnce({ ...monthly, summary: { ...monthly.summary, savings: '15000.00' } });
    vi.spyOn(api, 'netWorth').mockRejectedValueOnce(new Error('initial failure')).mockReturnValueOnce(retry.netWorth.promise);
    vi.spyOn(api, 'vaults')
      .mockResolvedValueOnce({ items: [trip] })
      .mockReturnValueOnce(retry.vaults.promise)
      .mockResolvedValueOnce({ items: [refreshedTrip] });
    vi.spyOn(api, 'contributeToVault').mockResolvedValue({
      id: 'contribution', vaultId: 'trip', amount: '5000.00', createdAt: '2026-09-04T08:00:00.000Z',
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Refresh and try again' }));
    await user.click(screen.getByRole('button', { name: 'Add money to Trip' }));
    await user.type(screen.getByLabelText('Contribution for Trip'), '5000');
    await user.click(screen.getByRole('button', { name: 'Add to Trip' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Vault goals' })).toHaveTextContent('20,000.00'));

    await act(async () => {
      retry.dashboard.resolve(dashboardWithTransactions('222.00'));
      retry.monthly.resolve(monthly);
      retry.netWorth.resolve(netWorth);
      retry.vaults.resolve({ items: [trip] });
    });
    await act(async () => Promise.resolve());

    expect(screen.getByRole('region', { name: 'Vault goals' })).toHaveTextContent('20,000.00');
    expect(screen.getByRole('region', { name: 'Vault goals' })).not.toHaveTextContent('15,000.00');
  });
});
