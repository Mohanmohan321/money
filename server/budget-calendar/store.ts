import type {
  BudgetCalendarCategory,
  BudgetCalendarDay,
  BudgetCalendarExpense,
  BudgetCalendarMonthConfiguration,
  BudgetCalendarMonthView,
  BudgetCalendarOverride,
  BudgetCalendarRule,
  BudgetCalendarReportSummary,
  BudgetCalendarSettings,
  BudgetCalendarTrends,
  CreateBudgetCalendarCategoryInput,
  CreateBudgetCalendarExpenseInput,
  CreateBudgetCalendarRuleInput,
  UpdateBudgetCalendarCategoryInput,
  UpdateBudgetCalendarExpenseInput,
  UpdateBudgetCalendarMonthInput,
  UpdateBudgetCalendarRuleInput,
  UpdateBudgetCalendarSettingsInput,
  UpsertBudgetCalendarOverrideInput,
} from '../../shared/budget-calendar';

export interface BudgetCalendarStore {
  getSettings(): Promise<BudgetCalendarSettings>;
  updateSettings(input: UpdateBudgetCalendarSettingsInput): Promise<BudgetCalendarSettings>;
  listCategories(options?: { includeArchived?: boolean }): Promise<BudgetCalendarCategory[]>;
  createCategory(input: CreateBudgetCalendarCategoryInput): Promise<BudgetCalendarCategory>;
  updateCategory(
    id: string,
    input: UpdateBudgetCalendarCategoryInput,
  ): Promise<BudgetCalendarCategory | undefined>;
  archiveCategory(id: string): Promise<'archived' | 'deleted' | 'missing'>;
  getMonth(month: string): Promise<BudgetCalendarMonthConfiguration>;
  updateMonth(
    month: string,
    input: UpdateBudgetCalendarMonthInput,
  ): Promise<BudgetCalendarMonthConfiguration>;
  listRules(): Promise<BudgetCalendarRule[]>;
  createRule(input: CreateBudgetCalendarRuleInput): Promise<BudgetCalendarRule>;
  updateRule(
    id: string,
    input: UpdateBudgetCalendarRuleInput,
  ): Promise<BudgetCalendarRule | undefined>;
  deleteRule(id: string): Promise<boolean>;
  upsertOverride(
    date: string,
    input: UpsertBudgetCalendarOverrideInput,
  ): Promise<BudgetCalendarOverride>;
  deleteOverride(date: string): Promise<boolean>;
  getDay(date: string, today: string): Promise<BudgetCalendarDay>;
  createExpense(input: CreateBudgetCalendarExpenseInput): Promise<
    | { outcome: 'created' | 'replayed'; expense: BudgetCalendarExpense }
    | { outcome: 'invalid_category' }
  >;
  updateExpense(
    id: string,
    input: UpdateBudgetCalendarExpenseInput,
  ): Promise<BudgetCalendarExpense | 'invalid_category' | undefined>;
  deleteExpense(id: string): Promise<boolean>;
  setDayRecordState(
    date: string,
    recordedZero: boolean,
  ): Promise<'updated' | 'expenses_exist'>;
  getCalendar(month: string, today: string): Promise<BudgetCalendarMonthView>;
  getSummary(
    month: string,
    weekAnchor: string,
    today: string,
  ): Promise<BudgetCalendarReportSummary>;
  getTrends(month: string, today: string): Promise<BudgetCalendarTrends>;
}
