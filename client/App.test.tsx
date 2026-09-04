// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const fixedNow = new Date('2026-09-01T12:00:00.000Z');

const dashboard = {
  timezone: 'Asia/Kolkata',
  today: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25',
    transactionCount: 1, lendingCount: 1, borrowingCount: 1,
  },
  week: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25', recordCount: 3,
    daily: [{ date: '2026-09-02', transactionAmount: '23.40', lentAmount: '50.00', borrowedAmount: '75.25' }],
  },
  month: {
    totalTransactions: '23.40', totalLent: '50.00', totalBorrowed: '75.25', recordCount: 3,
    daily: [{ date: '2026-09-02', transactionAmount: '23.40', lentAmount: '50.00', borrowedAmount: '75.25' }],
  },
};

const monthlyAnalysis = {
  month: '2026-09',
  budget: {
    month: '2026-09', salary: '55000.00', spendingLimit: '10000.00',
    savingsTarget: '12000.00', source: 'suggested' as const,
  },
  summary: {
    income: '55000.00', spending: '9000.00', savings: '10000.00',
    amountLeft: '36000.00', budgetScore: '18.18', spendingRemaining: '1000.00',
  },
  categories: [],
  weekFrom: '2026-08-31',
  weekTo: '2026-09-06',
  week: [],
  recentActivity: [
    {
      id: 'transaction-1', type: 'transaction' as const, description: 'Swiggy dinner',
      category: 'food' as const, amount: '1200.00', createdAt: '2026-09-03T12:30:00Z',
    },
    {
      id: 'income-1', type: 'income' as const, source: 'Freelance site',
      category: 'freelance' as const, amount: '5000.00', createdAt: '2026-09-02T10:00:00Z',
    },
    {
      id: 'transaction-2', type: 'transaction' as const, description: 'Metro ticket',
      category: 'travel' as const, amount: '80.00', createdAt: '2026-09-01T09:30:00Z',
    },
    {
      id: 'transaction-3', type: 'transaction' as const, description: 'Pharmacy',
      category: 'health' as const, amount: '320.00', createdAt: '2026-08-31T16:00:00Z',
    },
    {
      id: 'transaction-4', type: 'transaction' as const, description: 'Internet bill',
      category: 'bills' as const, amount: '999.00', createdAt: '2026-08-30T08:00:00Z',
    },
    {
      id: 'transaction-5', type: 'transaction' as const, description: 'Sixth record',
      category: 'other' as const, amount: '10.00', createdAt: '2026-08-29T08:00:00Z',
    },
  ],
};

const netWorth = {
  manualAssets: '300000.00',
  receivables: '20000.00',
  totalOwned: '320000.00',
  manualLiabilities: '90000.00',
  borrowedDebt: '10000.00',
  totalOwed: '100000.00',
  netWorth: '220000.00',
  status: 'positive' as const,
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installApi(
  initiallyAuthenticated = false,
  options: { fail?: string; refreshedIncome?: string; zeroWorth?: boolean } = {},
) {
  let authenticated = initiallyAuthenticated;
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path, method, body });

    if (path === '/api/auth/me') {
      return jsonResponse({ success: true, data: { authenticated } });
    }
    if (path === '/api/auth/login' && method === 'POST') {
      authenticated = true;
      return jsonResponse({ success: true, data: { authenticated: true } });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      authenticated = false;
      return jsonResponse({ success: true, data: { authenticated: false } });
    }
    if (path === '/api/dashboard') {
      if (options.fail === 'dashboard') {
        return jsonResponse({ success: false, error: { code: 'UNAVAILABLE', message: 'Dashboard unavailable' } }, 503);
      }
      return jsonResponse({ success: true, data: dashboard });
    }
    if (path.startsWith('/api/analysis/monthly?')) {
      if (options.fail === 'monthly') {
        return jsonResponse({ success: false, error: { code: 'UNAVAILABLE', message: 'Planning unavailable' } }, 503);
      }
      const monthlyCalls = calls.filter((call) => call.path.startsWith('/api/analysis/monthly?')).length;
      const data = monthlyCalls > 1 && options.refreshedIncome
        ? { ...monthlyAnalysis, summary: { ...monthlyAnalysis.summary, income: options.refreshedIncome } }
        : monthlyAnalysis;
      return jsonResponse({ success: true, data });
    }
    if (path === '/api/net-worth') {
      if (options.fail === 'net-worth') {
        return jsonResponse({ success: false, error: { code: 'UNAVAILABLE', message: 'Net worth unavailable' } }, 503);
      }
      return jsonResponse({
        success: true,
        data: options.zeroWorth ? { ...netWorth, netWorth: '0.00', status: 'zero' } : netWorth,
      });
    }
    if (path === '/api/vaults') {
      if (options.fail === 'vaults') {
        return jsonResponse({ success: false, error: { code: 'UNAVAILABLE', message: 'Vaults unavailable' } }, 503);
      }
      return jsonResponse({ success: true, data: { items: [] } });
    }
    if (path === '/api/budgets/2026-09' && method === 'PUT') {
      return jsonResponse({
        success: true,
        data: { month: '2026-09', ...body, source: 'saved', updatedAt: '2026-09-03T13:00:00Z' },
      });
    }
    if (path === '/api/lent' && method === 'POST') {
      return jsonResponse({
        success: true,
        data: { id: '1', personName: body.personName, amount: '50.00', createdAt: '2026-09-02T10:00:00Z' },
      }, 201);
    }
    if (path.startsWith('/api/history')) {
      return jsonResponse({ success: true, data: { items: [], total: 0, limit: 50, offset: 0 } });
    }
    if (path.startsWith('/api/analytics')) {
      return jsonResponse({
        success: true,
        data: {
          period: 'month', timezone: 'Asia/Kolkata', from: '2025-10-01', to: '2026-09-30',
          movement: [],
          transactions: { totalAmount: '0.00', count: 0, averageAmount: '0.00', largestAmount: '0.00', smallestAmount: '0.00' },
          lending: { totalAmount: '0.00', count: 0, averageAmount: '0.00', largestAmount: '0.00' },
          borrowing: { totalAmount: '0.00', count: 0, averageAmount: '0.00', largestAmount: '0.00' },
          lendingByPerson: [], borrowingByPerson: [],
        },
      });
    }
    return jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(fixedNow);
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('mobile money manager', () => {
  it('logs in through the backend and renders server-provided dashboard totals', async () => {
    installApi(false);
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('Password'), '2003');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('heading', { name: "Today's snapshot" })).toBeVisible();
    expect(screen.getByText('23.40')).toBeVisible();
    expect(screen.getByText('50.00')).toBeVisible();
    expect(screen.getByText('75.25')).toBeVisible();
    expect(localStorage.length).toBe(0);
  });

  it('submits only person name and amount when logging money lent', async () => {
    const api = installApi(true);
    window.history.pushState({}, '', '/add');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: 'Money lent' }));
    await user.type(screen.getByLabelText('Person name'), 'Maya');
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Save money lent' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Money lent saved');
    expect(api.calls.find((call) => call.path === '/api/lent' && call.method === 'POST')?.body)
      .toEqual({ personName: 'Maya', amount: '50' });
    expect(screen.queryByLabelText(/date|time/i)).not.toBeInTheDocument();
  });

  it('logs out through the backend and returns to the lock screen', async () => {
    const api = installApi(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Your money, kept private.' })).toBeVisible();
    expect(api.calls).toContainEqual({ path: '/api/auth/logout', method: 'POST', body: undefined });
  });

  it('places exact budget, net worth, and recent activity before today', async () => {
    const backend = installApi(true);
    render(<App />);

    const budgetHeading = await screen.findByRole('heading', { name: 'Monthly budget' });
    const netWorthHeading = screen.getByRole('heading', { name: 'Net worth' });
    const recentHeading = screen.getByRole('heading', { name: 'Recent transactions' });
    const todayHeading = screen.getByRole('heading', { name: "Today's snapshot" });
    expect(budgetHeading.compareDocumentPosition(netWorthHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(netWorthHeading.compareDocumentPosition(recentHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(recentHeading.compareDocumentPosition(todayHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const budget = screen.getByRole('region', { name: 'Monthly budget' });
    for (const label of ['Income', 'Spending', 'Savings', 'Amount left']) {
      expect(within(budget).getByText(label)).toBeVisible();
    }
    expect(within(budget).getByText('18.18%')).toBeVisible();
    expect(within(budget).getByText('1,000.00')).toBeVisible();
    expect(within(budget).getByText('Suggested plan')).toBeVisible();

    const worth = screen.getByRole('region', { name: 'Net worth' });
    expect(within(worth).getByText('Manual assets')).toBeVisible();
    expect(within(worth).getByText('Receivables')).toBeVisible();
    expect(within(worth).getByText('Total owned')).toBeVisible();
    expect(within(worth).getByText('Manual liabilities')).toBeVisible();
    expect(within(worth).getByText('Borrowed debt')).toBeVisible();
    expect(within(worth).getByText('Total owed')).toBeVisible();
    expect(within(worth).getByText('Positive')).toBeVisible();
    expect(within(worth).getByText(/(?:2,20,000|220,000)\.00/)).toBeVisible();

    const recent = screen.getByRole('region', { name: 'Recent transactions' });
    expect(within(recent).getByText('Swiggy dinner')).toBeVisible();
    expect(within(recent).getByTestId('category-food')).toHaveTextContent('Food');
    expect(within(recent).getByText('Freelance site')).toBeVisible();
    expect(within(recent).getByText(/Income.*Freelance/)).toBeVisible();
    expect(within(recent).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/history');
    expect(within(recent).queryAllByRole('img')).toHaveLength(0);
    expect(within(recent).queryByText('Sixth record')).not.toBeInTheDocument();
    expect(backend.calls).toContainEqual({
      path: '/api/analysis/monthly?month=2026-09', method: 'GET', body: undefined,
    });
  });

  it('edits the suggested budget inline and refreshes only monthly analysis after save', async () => {
    const backend = installApi(true, { refreshedIncome: '56000.00' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Edit monthly budget' }));
    expect(screen.getByRole('form', { name: 'Edit monthly budget' })).toBeVisible();
    expect(screen.getByLabelText('Monthly salary')).toHaveValue('55000.00');
    expect(screen.getByLabelText('Spending limit')).toHaveValue('10000.00');
    expect(screen.getByLabelText('Savings target')).toHaveValue('12000.00');

    await user.clear(screen.getByLabelText('Monthly salary'));
    await user.type(screen.getByLabelText('Monthly salary'), '56000');
    await user.click(screen.getByRole('button', { name: 'Save budget' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit monthly budget' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Monthly budget' })).toHaveTextContent('56,000.00');
    expect(backend.calls.find((call) => call.path === '/api/budgets/2026-09' && call.method === 'PUT')?.body)
      .toEqual({ salary: '56000', spendingLimit: '10000.00', savingsTarget: '12000.00' });
    expect(backend.calls.filter((call) => call.path.startsWith('/api/analysis/monthly?'))).toHaveLength(2);
    expect(backend.calls.filter((call) => call.path === '/api/dashboard')).toHaveLength(1);
    expect(backend.calls.filter((call) => call.path === '/api/net-worth')).toHaveLength(1);
    expect(backend.calls.filter((call) => call.path === '/api/vaults')).toHaveLength(1);
  });

  it('presents the server net-worth status without financial inference', async () => {
    installApi(true, { zeroWorth: true });
    render(<App />);

    const worth = await screen.findByRole('region', { name: 'Net worth' });
    expect(within(worth).getByText('Zero')).toBeVisible();
    expect(within(worth).getByText('0.00')).toBeVisible();
  });

  it('keeps successful panels and the original daily totals when one request fails', async () => {
    const backend = installApi(true, { fail: 'net-worth' });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Monthly budget' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Net worth' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent transactions' })).toBeVisible();
    expect(screen.getByRole('heading', { name: "Today's snapshot" })).toBeVisible();
    expect(screen.getByText('23.40')).toBeVisible();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/refresh.*try again/i);
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Refresh and try again' }));
    await waitFor(() => {
      expect(backend.calls.filter((call) => call.path === '/api/dashboard')).toHaveLength(2);
    });
  });
});
