import type {
  AnalyticsData,
  DashboardData,
  HistoryItem,
  RecordType,
} from '../../shared/contracts';
import type { dashboardRanges } from '../lib/time';

export interface HistoryStoreQuery {
  type?: RecordType;
  from?: Date;
  toExclusive?: Date;
  limit: number;
  offset: number;
}

export interface DashboardStoreQuery {
  timezone: string;
  ranges: ReturnType<typeof dashboardRanges>;
}

export interface AnalyticsStoreQuery {
  period: 'day' | 'week' | 'month' | 'year';
  timezone: string;
  from: Date;
  toExclusive: Date;
  fromLabel: string;
  toLabel: string;
}

export interface AggregateStore {
  getHistory(query: HistoryStoreQuery): Promise<{ items: HistoryItem[]; total: number }>;
  getDashboard(query: DashboardStoreQuery): Promise<DashboardData>;
  getAnalytics(query: AnalyticsStoreQuery): Promise<AnalyticsData>;
}
