import type { BudgetDateOverride, BudgetExpense, BudgetMonthWorkspace, BudgetSettings } from '../../shared/budget-workspace';

export interface CreateBudgetExpenseInput {
  expenseDate: string;
  amount: string;
  budgetCategory: string;
  description: string;
  notes?: string;
  idempotencyKey: string;
}

export type UpdateBudgetExpenseInput = Omit<CreateBudgetExpenseInput, 'idempotencyKey'>;

export interface BudgetWorkspaceStore {
  getWorkspace(month: string, today: string): Promise<BudgetMonthWorkspace>;
  saveSettings(settings: BudgetSettings): Promise<BudgetSettings>;
  saveOverride(value: BudgetDateOverride): Promise<BudgetDateOverride>;
  deleteOverride(date: string): Promise<boolean>;
  setRecordedZero(date: string, recorded: boolean): Promise<boolean>;
  createExpense(input: CreateBudgetExpenseInput): Promise<BudgetExpense>;
  updateExpense(id: string, input: UpdateBudgetExpenseInput): Promise<BudgetExpense | undefined>;
  deleteExpense(id: string): Promise<boolean>;
}
