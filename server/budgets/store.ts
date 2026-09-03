import type {
  CreateIncomeInput,
  IncomeRecord,
  MonthlyBudget,
  UpsertBudgetInput,
} from '../../shared/contracts';

export interface ListFilters {
  from?: Date;
  toExclusive?: Date;
}

export interface BudgetStore {
  getBudget(month: string): Promise<MonthlyBudget>;
  upsertBudget(month: string, input: UpsertBudgetInput): Promise<MonthlyBudget>;
  createIncome(input: CreateIncomeInput): Promise<IncomeRecord>;
  listIncome(filters: ListFilters): Promise<IncomeRecord[]>;
  getIncome(id: string): Promise<IncomeRecord | undefined>;
  deleteIncome(id: string): Promise<boolean>;
}
