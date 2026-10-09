import type {
  BudgetCalendarCategory,
  BudgetCalendarMonthConfiguration,
  BudgetCalendarOverride,
  BudgetCalendarRule,
  BudgetCalendarSettings,
  CreateBudgetCalendarCategoryInput,
  CreateBudgetCalendarRuleInput,
  UpdateBudgetCalendarCategoryInput,
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
}
