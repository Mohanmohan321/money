import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './api';

function successResponse(data: unknown = {}) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('budgeting API client', () => {
  it('uses the exact budget, analysis, collection, and net-worth paths', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      successResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.budget('2026-09');
    await api.monthlyAnalysis('month=2026-09&week=2026-09-03');
    await api.budgetBreakdown('year=2026&month=2026-09');
    await api.annualReport('year=2026');
    await api.vaults();
    await api.assets();
    await api.liabilities();
    await api.netWorth();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/budgets/2026-09',
      '/api/analysis/monthly?month=2026-09&week=2026-09-03',
      '/api/analysis/breakdown?year=2026&month=2026-09',
      '/api/analysis/annual?year=2026',
      '/api/vaults',
      '/api/assets',
      '/api/liabilities',
      '/api/net-worth',
    ]);
  });

  it('sends exact typed budgeting mutation methods and bodies', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      successResponse());
    vi.stubGlobal('fetch', fetchMock);

    await api.saveBudget('2026-09', {
      salary: '50000.00', spendingLimit: '20000.00', savingsTarget: '10000.00',
    });
    await api.createIncome({ source: 'Freelance', category: 'freelance', amount: '5000.00' });
    await api.updateIncome('income-id', {
      source: 'Client work', category: 'freelance', amount: '5500.00',
      createdAt: '2026-09-03T10:00:00.000Z',
    });
    await api.deleteIncome('income-id');
    await api.createAsset({ name: 'Bank', type: 'bank', currentValue: '10000.00' });
    await api.updateAsset('asset-id', { name: 'Bank', type: 'bank', currentValue: '12000.00' });
    await api.deleteAsset('asset-id');
    await api.createLiability({ name: 'Card', type: 'credit-card', outstandingBalance: '2000.00' });
    await api.updateLiability('liability-id', {
      name: 'Card', type: 'credit-card', outstandingBalance: '1500.00',
    });
    await api.deleteLiability('liability-id');
    await api.createVault({ name: 'Trip', emoji: '✈️', targetAmount: '60000.00' });
    await api.updateVault('vault-id', {
      name: 'Trip', emoji: '✈️', targetAmount: '65000.00', targetDate: '2027-01-01',
    });
    await api.contributeToVault('vault-id', { amount: '1000.00' });
    await api.archiveVault('vault-id');
    await api.deleteVault('vault-id');

    expect(fetchMock.mock.calls.map(([path, init]) => ({
      path,
      method: (init as RequestInit).method,
      body: (init as RequestInit).body ? JSON.parse((init as RequestInit).body as string) : undefined,
    }))).toEqual([
      { path: '/api/budgets/2026-09', method: 'PUT', body: { salary: '50000.00', spendingLimit: '20000.00', savingsTarget: '10000.00' } },
      { path: '/api/income', method: 'POST', body: { source: 'Freelance', category: 'freelance', amount: '5000.00' } },
      { path: '/api/income/income-id', method: 'PUT', body: { source: 'Client work', category: 'freelance', amount: '5500.00', createdAt: '2026-09-03T10:00:00.000Z' } },
      { path: '/api/income/income-id', method: 'DELETE', body: undefined },
      { path: '/api/assets', method: 'POST', body: { name: 'Bank', type: 'bank', currentValue: '10000.00' } },
      { path: '/api/assets/asset-id', method: 'PUT', body: { name: 'Bank', type: 'bank', currentValue: '12000.00' } },
      { path: '/api/assets/asset-id', method: 'DELETE', body: undefined },
      { path: '/api/liabilities', method: 'POST', body: { name: 'Card', type: 'credit-card', outstandingBalance: '2000.00' } },
      { path: '/api/liabilities/liability-id', method: 'PUT', body: { name: 'Card', type: 'credit-card', outstandingBalance: '1500.00' } },
      { path: '/api/liabilities/liability-id', method: 'DELETE', body: undefined },
      { path: '/api/vaults', method: 'POST', body: { name: 'Trip', emoji: '✈️', targetAmount: '60000.00' } },
      { path: '/api/vaults/vault-id', method: 'PUT', body: { name: 'Trip', emoji: '✈️', targetAmount: '65000.00', targetDate: '2027-01-01' } },
      { path: '/api/vaults/vault-id/contributions', method: 'POST', body: { amount: '1000.00' } },
      { path: '/api/vaults/vault-id/archive', method: 'POST', body: undefined },
      { path: '/api/vaults/vault-id', method: 'DELETE', body: undefined },
    ]);
  });

  it('adds a category only when transaction creation receives an override', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      successResponse());
    vi.stubGlobal('fetch', fetchMock);

    await api.createTransaction('Swiggy dinner', '500.00', 'food');
    await api.createTransaction('Unknown shop', '100.00');

    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string))).toEqual([
      { description: 'Swiggy dinner', amount: '500.00', category: 'food' },
      { description: 'Unknown shop', amount: '100.00' },
    ]);
  });
});
