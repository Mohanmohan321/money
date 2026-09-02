import type {
  AnalyticsData,
  ApiResponse,
  DashboardData,
  HistoryItem,
  PersonRecord,
  TransactionRecord,
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
  createTransaction: (description: string, amount: string) =>
    apiRequest<TransactionRecord>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ description, amount }),
    }),
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
