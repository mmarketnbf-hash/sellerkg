import type {
  Account,
  CollectorRun,
  CostPrice,
  DataSource,
  EventRow,
  FinanceWeeklyReport,
  Overview,
  ProductRow,
  SyncState
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      payload?.error ??
        (response.status === 500 ? 'API недоступен или не настроено подключение к БД.' : `HTTP ${response.status}`)
    );
  }

  return (await response.json()) as T;
}

export function fetchOverview() {
  return request<Overview>('/api/overview');
}

export function fetchAccounts() {
  return request<Account[]>('/api/accounts');
}

export function fetchFinanceWeeklyReports(accountId: string, scope: 'recent' | 'all' = 'recent') {
  return request<FinanceWeeklyReport[]>(
    `/api/finance-weekly-reports?accountId=${encodeURIComponent(accountId)}&scope=${scope}`
  );
}

export function fetchCostPrices(accountId: string) {
  return request<CostPrice[]>(`/api/cost-prices?accountId=${encodeURIComponent(accountId)}`);
}

export function updateCostPrice(id: string, cost: number) {
  return request<CostPrice>(`/api/cost-prices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ cost })
  });
}

export function fetchProducts() {
  return request<ProductRow[]>('/api/products?limit=50');
}

export function fetchSources() {
  return request<DataSource[]>('/api/sources');
}

export function fetchRuns() {
  return request<CollectorRun[]>('/api/runs?limit=40');
}

export function fetchEvents() {
  return request<EventRow[]>('/api/events?limit=40');
}

export function fetchSyncStates() {
  return request<SyncState[]>('/api/sync-states');
}

export function runSource(sourceId: string) {
  return request<{ status: string; rowsRead: number; rowsWritten: number; message: string }>(
    `/api/sources/${sourceId}/run`,
    { method: 'POST' }
  );
}

export function updateSource(sourceId: string, body: Partial<DataSource>) {
  return request<DataSource>(`/api/sources/${sourceId}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}
