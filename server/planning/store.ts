import type {
  AnnualReportData,
  BudgetBreakdownData,
  MonthlyAnalysisData,
} from '../../shared/contracts';
import type { UtcRange } from '../lib/time';

export interface MonthlyPlanningQuery {
  month: string;
  timezone: string;
  range: UtcRange;
  week: UtcRange;
  weekFromLabel: string;
  weekToLabel: string;
}

export interface BreakdownPlanningQuery {
  year: string;
  selectedMonth: string;
  timezone: string;
  yearRange: UtcRange;
  monthRange: UtcRange;
}

export interface AnnualPlanningQuery {
  year: string;
  timezone: string;
  range: UtcRange;
}

export interface PlanningStore {
  getMonthly(query: MonthlyPlanningQuery): Promise<MonthlyAnalysisData>;
  getBreakdown(query: BreakdownPlanningQuery): Promise<BudgetBreakdownData>;
  getAnnual(query: AnnualPlanningQuery): Promise<AnnualReportData>;
}
