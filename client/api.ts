import type {
  AnalyticsData,
  AnnualReportData,
  ApiResponse,
  AssetRecord,
  BudgetBreakdownData,
  CreateAssetInput,
  CreateIncomeInput,
  CreateLiabilityInput,
  CreateVaultContributionInput,
  CreateVaultInput,
  DashboardData,
  HistoryItem,
  IncomeRecord,
  LiabilityRecord,
  MonthlyAnalysisData,
  MonthlyBudget,
  NetWorthSummary,
  PersonRecord,
  SpendingCategory,
  TransactionRecord,
  UpdateAssetInput,
  UpdateIncomeInput,
  UpdateLiabilityInput,
  UpdateVaultInput,
  UpsertBudgetInput,
  Vault,
  VaultContribution,
} from '../shared/contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    const failure = payload.success
      ? { message: 'Request failed', code: 'REQUEST_FAILED' }
      : payload.error;
    throw new ApiError(failure.message, failure.code, response.status);
  }
  return payload.data;
}

export const api = {
  me: () => apiRequest<{ authenticated: boolean }>('/api/auth/me'),
  login: (password: string) =>
    apiRequest<{ authenticated: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () =>
    apiRequest<{ authenticated: boolean }>('/api/auth/logout', { method: 'POST' }),
  dashboard: () => apiRequest<DashboardData>('/api/dashboard'),
  history: (query: string) =>
    apiRequest<{ items: HistoryItem[]; total: number; limit: number; offset: number }>(
      `/api/history${query ? `?${query}` : ''}`,
    ),
  analytics: (query: string) => apiRequest<AnalyticsData>(`/api/analytics?${query}`),
  budget: (month: string) => apiRequest<MonthlyBudget>(`/api/budgets/${month}`),
  saveBudget: (month: string, input: UpsertBudgetInput) =>
    apiRequest<MonthlyBudget>(`/api/budgets/${month}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  monthlyAnalysis: (query: string) =>
    apiRequest<MonthlyAnalysisData>(`/api/analysis/monthly?${query}`),
  budgetBreakdown: (query: string) =>
    apiRequest<BudgetBreakdownData>(`/api/analysis/breakdown?${query}`),
  annualReport: (query: string) =>
    apiRequest<AnnualReportData>(`/api/analysis/annual?${query}`),
  createTransaction: (description: string, amount: string, category?: SpendingCategory) =>
    apiRequest<TransactionRecord>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ description, amount, ...(category ? { category } : {}) }),
    }),
  createIncome: (input: CreateIncomeInput) =>
    apiRequest<IncomeRecord>('/api/income', { method: 'POST', body: JSON.stringify(input) }),
  updateIncome: (id: string, input: UpdateIncomeInput) =>
    apiRequest<IncomeRecord>(`/api/income/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteIncome: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/api/income/${id}`, { method: 'DELETE' }),
  vaults: () => apiRequest<{ items: Vault[] }>('/api/vaults'),
  createVault: (input: CreateVaultInput) =>
    apiRequest<Vault>('/api/vaults', { method: 'POST', body: JSON.stringify(input) }),
  updateVault: (id: string, input: UpdateVaultInput) =>
    apiRequest<Vault>(`/api/vaults/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  contributeToVault: (id: string, input: CreateVaultContributionInput) =>
    apiRequest<VaultContribution>(`/api/vaults/${id}/contributions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  archiveVault: (id: string) =>
    apiRequest<Vault>(`/api/vaults/${id}/archive`, { method: 'POST' }),
  deleteVault: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/api/vaults/${id}`, { method: 'DELETE' }),
  assets: () => apiRequest<{ items: AssetRecord[] }>('/api/assets'),
  createAsset: (input: CreateAssetInput) =>
    apiRequest<AssetRecord>('/api/assets', { method: 'POST', body: JSON.stringify(input) }),
  updateAsset: (id: string, input: UpdateAssetInput) =>
    apiRequest<AssetRecord>(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteAsset: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/api/assets/${id}`, { method: 'DELETE' }),
  liabilities: () => apiRequest<{ items: LiabilityRecord[] }>('/api/liabilities'),
  createLiability: (input: CreateLiabilityInput) =>
    apiRequest<LiabilityRecord>('/api/liabilities', { method: 'POST', body: JSON.stringify(input) }),
  updateLiability: (id: string, input: UpdateLiabilityInput) =>
    apiRequest<LiabilityRecord>(`/api/liabilities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteLiability: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/api/liabilities/${id}`, { method: 'DELETE' }),
  netWorth: () => apiRequest<NetWorthSummary>('/api/net-worth'),
  createLent: (personName: string, amount: string) =>
    apiRequest<PersonRecord>('/api/lent', {
      method: 'POST',
      body: JSON.stringify({ personName, amount }),
    }),
  createBorrowed: (personName: string, amount: string) =>
    apiRequest<PersonRecord>('/api/borrowed', {
      method: 'POST',
      body: JSON.stringify({ personName, amount }),
    }),
  deleteRecord: (type: HistoryItem['type'], id: string) => {
    const resource = type === 'transaction' ? 'transactions' : type;
    return apiRequest<{ deleted: boolean }>(`/api/${resource}/${id}`, { method: 'DELETE' });
  },
};
