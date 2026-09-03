# Budgeting Dashboard and Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete server-computed Dashboard, income/category entry, recent History, Vault and Net Worth controls, and the three-tab Analysis experience.

**Architecture:** Add a focused planning-aggregate store instead of expanding the existing movement aggregate into an unrelated monolith. The React pages fetch typed server views and delegate visual units to small components. Custom semantic HTML, CSS, and SVG provide charts without introducing a chart framework.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Lucide React, CSS, Express 5, Drizzle ORM, PostgreSQL/Neon, Luxon, Decimal.js, Vitest, Testing Library, Supertest, Playwright

## Global Constraints

- Complete `2026-09-03-budgeting-foundation.md` first; this plan consumes its contracts, tables, stores, and routes.
- All totals, percentages, calendar grouping, and report aggregates come from the server; the browser only formats and displays them.
- Dashboard order is Monthly Budget, Net Worth, Recent Transactions, Vault Goals, subscription forecast, then existing daily and weekly summaries.
- Analysis uses three accessible tabs: Monthly Budget, Budgeting Breakdown, and Annual Report.
- Category meaning must never depend on color alone; every mark includes an icon, visible label, legend, table, or accessible name.
- Preserve the mobile-first 320 px floor, existing desktop side rail at 980 px, reduced-motion behavior, and current authentication boundary.
- Spending includes transactions only; Savings includes Vault contributions; Amount left is income minus spending minus savings.
- Charts and calendar use `APP_TIMEZONE` boundaries supplied by the API.
- Empty, loading, error, negative-balance, and zero-income states need explicit copy and tests.

---

## File Structure

- `server/planning/*`: month, calendar, annual, and Dashboard-oriented aggregate views.
- `server/lib/time.ts`: exact month, year, and containing-week ranges.
- `shared/contracts.ts`: typed view contracts and query schemas.
- `client/components/CategoryBadge.tsx`: one category metadata and rendering source.
- `client/components/BudgetOverview.tsx`: editable monthly budget card and four summary values.
- `client/components/NetWorthCard.tsx`: owned, owed, and status summary.
- `client/components/RecentActivity.tsx`: latest income/spending rows.
- `client/components/VaultGoals.tsx`: Vault list, create form, and contributions.
- `client/components/WeeklyExpenseTracker.tsx`: Monday-Sunday view.
- `client/components/BreakdownCalendar.tsx`: month grid and selected-day details.
- `client/components/AccessibleCharts.tsx`: SVG bar, line, and pie charts with data tables.
- `client/pages/AnalyticsPage.tsx`: Analysis tab coordinator only.

### Task 1: Planning Date Ranges and View Contracts

**Files:**
- Modify: `server/lib/time.ts`
- Modify: `server/lib/time.test.ts`
- Modify: `shared/contracts.ts`
- Modify: `shared/contracts.test.ts`

**Interfaces:**
- Produces: `monthRange(month, timezone)`, `yearRange(year, timezone)`, `weekRangeContaining(localDate, timezone)` and typed Monthly, Breakdown, and Annual view contracts.
- Consumes: Luxon and existing `UtcRange` conventions.

- [ ] **Step 1: Write failing timezone-boundary and query-schema tests**

```ts
it('builds Kolkata month, year, and Monday week boundaries', () => {
  expect(monthRange('2026-09', 'Asia/Kolkata')).toEqual({
    from: new Date('2026-08-31T18:30:00.000Z'),
    toExclusive: new Date('2026-09-30T18:30:00.000Z'),
  });
  expect(yearRange('2026', 'Asia/Kolkata').from.toISOString()).toBe('2025-12-31T18:30:00.000Z');
  expect(weekRangeContaining('2026-09-03', 'Asia/Kolkata').from.toISOString())
    .toBe('2026-08-30T18:30:00.000Z');
});

it('validates planning queries', () => {
  expect(monthlyAnalysisQuerySchema.parse({ month: '2026-09', week: '2026-09-03' }))
    .toEqual({ month: '2026-09', week: '2026-09-03' });
  expect(() => annualAnalysisQuerySchema.parse({ year: '26' })).toThrow();
});
```

- [ ] **Step 2: Run focused tests and verify missing exports fail**

Run: `npm.cmd test -- server/lib/time.test.ts shared/contracts.test.ts`

Expected: FAIL on missing range helpers and schemas.

- [ ] **Step 3: Implement validated range helpers**

Parse local inputs with strict Luxon formats and `setZone: true`, reject invalid calendar dates, and return half-open UTC ranges. The containing week always starts Monday local time.

Define these response shapes exactly:

```ts
export interface CategorySpend { category: SpendingCategory; amount: string; percentage: string; }
export type RecentActivity =
  | (TransactionRecord & { type: 'transaction' })
  | (IncomeRecord & { type: 'income' });
export interface DailyBudgetPoint {
  date: string; income: string; spending: string; savings: string; activity: RecentActivity[];
}
export interface MonthlyAnalysisData {
  month: string; budget: MonthlyBudget; summary: BudgetSummary;
  categories: CategorySpend[]; weekFrom: string; weekTo: string;
  week: DailyBudgetPoint[]; recentActivity: RecentActivity[];
}
export interface MonthBudgetBreakdown {
  month: string; income: string; spending: string; savings: string;
  amountLeft: string; budgetUsage: string;
}
export interface CalendarDay extends DailyBudgetPoint {
  vaultContributionCount: number; subscriptionPaymentCount: number;
  activity: RecentActivity[];
}
export interface BudgetBreakdownData {
  year: string; selectedMonth: string; months: MonthBudgetBreakdown[]; days: CalendarDay[];
}
export interface AnnualReportData {
  year: string; summary: BudgetSummary; months: MonthBudgetBreakdown[];
  spendingByCategory: CategorySpend[];
  incomeBySource: Array<{ source: string; amount: string; percentage: string }>;
  highestSpendingMonth?: string; bestSavingMonth?: string;
}
```

Use Zod queries: monthly `{ month, week? }`, breakdown `{ year, month }` with matching year, and annual `{ year }`.

- [ ] **Step 4: Run range and contract tests**

Run: `npm.cmd test -- server/lib/time.test.ts shared/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit planning primitives**

```powershell
git add server/lib/time.ts server/lib/time.test.ts shared/contracts.ts shared/contracts.test.ts
git commit -m "feat: define planning analysis views"
```

### Task 2: Server Planning Aggregates and Routes

**Files:**
- Create: `server/planning/store.ts`
- Create: `server/planning/drizzle-planning-store.ts`
- Create: `server/planning/routes.ts`
- Create: `server/planning/routes.test.ts`
- Create: `server/planning/calculations.test.ts`
- Modify: `index.ts`

**Interfaces:**
- Produces: `PlanningStore.getMonthly`, `getBreakdown`, `getAnnual`; authenticated GET routes under `/api/analysis`.
- Consumes: ranges from Task 1, foundation tables, `calculateBudgetSummary`, and persisted category values.

- [ ] **Step 1: Write failing route tests that prove query conversion and response envelopes**

```ts
it('returns the selected month and Monday-Sunday view', async () => {
  const response = await agent.get('/api/analysis/monthly?month=2026-09&week=2026-09-03').expect(200);
  expect(response.body.data).toEqual(monthlyView);
  expect(store.monthlyQuery).toEqual(expect.objectContaining({ month: '2026-09' }));
  expect(store.monthlyQuery?.range.from.toISOString()).toBe('2026-08-31T18:30:00.000Z');
  expect(store.monthlyQuery?.week.from.toISOString()).toBe('2026-08-30T18:30:00.000Z');
});

it.each([
  '/api/analysis/monthly?month=2026-13',
  '/api/analysis/breakdown?year=2026&month=2025-09',
  '/api/analysis/annual?year=20x6',
])('rejects invalid planning query %s', async (path) => {
  await agent.get(path).expect(400).expect(({ body }) => expect(body.error.code).toBe('VALIDATION_ERROR'));
});
```

- [ ] **Step 2: Run route tests and verify missing-module failure**

Run: `npm.cmd test -- server/planning/routes.test.ts`

Expected: FAIL because planning routes do not exist.

- [ ] **Step 3: Define the store interface and router**

```ts
export interface MonthlyPlanningQuery {
  month: string; timezone: string; range: UtcRange; week: UtcRange;
  weekFromLabel: string; weekToLabel: string;
}
export interface BreakdownPlanningQuery {
  year: string; selectedMonth: string; timezone: string; yearRange: UtcRange; monthRange: UtcRange;
}
export interface PlanningStore {
  getMonthly(query: MonthlyPlanningQuery): Promise<MonthlyAnalysisData>;
  getBreakdown(query: BreakdownPlanningQuery): Promise<BudgetBreakdownData>;
  getAnnual(query: { year: string; timezone: string; range: UtcRange }): Promise<AnnualReportData>;
}
```

The router parses queries, calculates ranges, calls one store method, and returns `{ success: true, data }`. It catches Luxon range errors as `INVALID_DATE` using the existing `AppError` style.

- [ ] **Step 4: Implement server-side monthly aggregation**

Use bounded queries for:

1. Saved or suggested monthly budget.
2. Salary plus income sums.
3. Transaction spending total and category grouping.
4. Vault contribution sum.
5. Seven zero-filled Monday-Sunday daily points.
6. Five newest transaction/income activity rows.

Calculate each category percentage as `category amount / spending * 100`, returning `0.00` when spending is zero. Always return all eight categories in taxonomy order so UI ordering is stable.

- [ ] **Step 5: Implement calendar and annual aggregation**

Breakdown returns 12 month rows in January-December order and all actual calendar dates for the selected month. Zero-fill missing days with income/spending/savings `0.00`. Each day includes its activity list and Vault contribution count. Set `subscriptionPaymentCount` to zero until the automation plan provides confirmed matches. Budget usage is `spending / spendingLimit * 100`; a zero spending limit returns `0.00`.

Annual uses the same 12-month rows, grouped category totals, and grouped income sources, including configured monthly salary under the source label `Salary`. Its summary adds the 12 saved/suggested salary values, additional income, spending, Vault savings, and spending limits before calling `calculateBudgetSummary`. Choose highest-spending month by numeric amount, then earliest month on ties; choose best-saving month by numeric savings, then earliest month. Percentages use Decimal.js.

- [ ] **Step 6: Verify store arithmetic using a deterministic fake database boundary**

In `calculations.test.ts`, expose and test small pure helpers `fillBudgetDays`, `fillBudgetMonths`, `percentageOf`, and `selectExtremeMonth`. Do not test SQL strings. Assert empty-year zero filling, leap-year February, negative amount-left preservation, percentage zero denominator, and stable tie breaking.

Run: `npm.cmd test -- server/planning`

Expected: PASS.

- [ ] **Step 7: Wire and verify the router**

Instantiate `DrizzlePlanningStore` with the existing database and Budget store, then mount `createPlanningRouter` behind authentication in `index.ts`.

Run: `npm.cmd test -- server/planning server/app.test.ts`

Expected: PASS and unauthenticated planning requests remain 401.

- [ ] **Step 8: Commit planning APIs**

```powershell
git add index.ts server/planning
git commit -m "feat: add budgeting analysis APIs"
```

### Task 3: Client API Methods and Category Presentation

**Files:**
- Modify: `client/api.ts`
- Create: `client/components/CategoryBadge.tsx`
- Create: `client/components/CategoryBadge.test.tsx`
- Create: `client/format.ts`
- Create: `client/format.test.ts`

**Interfaces:**
- Produces: typed API methods, `categoryPresentation`, `CategoryBadge`, `formatMoney`, and `formatMonth`.
- Consumes: shared foundation and analysis contracts.

- [ ] **Step 1: Write failing category and formatter tests**

```tsx
it('renders Food with an icon and accessible visible label', () => {
  render(<CategoryBadge category="food" />);
  expect(screen.getByText('Food')).toBeVisible();
  expect(screen.getByTestId('category-food')).toHaveClass('category-food');
});

it('formats signed decimal strings without performing arithmetic', () => {
  expect(formatMoney('-1234.50')).toMatch(/-.*1,234\.50/);
  expect(formatMonth('2026-09', 'en-IN')).toBe('September 2026');
});
```

- [ ] **Step 2: Run tests and verify missing exports fail**

Run: `npm.cmd test -- client/components/CategoryBadge.test.tsx client/format.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement one category metadata map**

Map category keys to these Lucide icons and labels: food/Burger/Food, travel/Plane/Travel, shopping/ShoppingBag/Shopping, coffee/Coffee/Coffee, entertainment/Clapperboard/Entertainment, health/HeartPulse/Health, bills/ReceiptText/Bills, other/WalletCards/Other. `CategoryBadge` renders the icon with `aria-hidden` and visible text.

Use `Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` for display only. Do not coerce monetary strings for calculations.

- [ ] **Step 4: Add API methods with exact paths**

```ts
budget: (month: string) => apiRequest<MonthlyBudget>(`/api/budgets/${month}`),
saveBudget: (month: string, input: UpsertBudgetInput) => apiRequest<MonthlyBudget>(`/api/budgets/${month}`, { method: 'PUT', body: JSON.stringify(input) }),
monthlyAnalysis: (query: string) => apiRequest<MonthlyAnalysisData>(`/api/analysis/monthly?${query}`),
budgetBreakdown: (query: string) => apiRequest<BudgetBreakdownData>(`/api/analysis/breakdown?${query}`),
annualReport: (query: string) => apiRequest<AnnualReportData>(`/api/analysis/annual?${query}`),
vaults: () => apiRequest<{ items: Vault[] }>('/api/vaults'),
netWorth: () => apiRequest<NetWorthSummary>('/api/net-worth'),
```

Also add typed create/delete income, create/update/delete asset/liability, create/archive Vault, and contribute-to-Vault methods using the contracts from the foundation plan.

Extend categorized transaction creation with the exact signature:

```ts
createTransaction: (description: string, amount: string, category?: SpendingCategory) =>
  apiRequest<TransactionRecord>('/api/transactions', {
    method: 'POST', body: JSON.stringify({ description, amount, ...(category ? { category } : {}) }),
  }),
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm.cmd test -- client/components/CategoryBadge.test.tsx client/format.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit client primitives**

```powershell
git add client/api.ts client/format.ts client/format.test.ts client/components/CategoryBadge.tsx client/components/CategoryBadge.test.tsx
git commit -m "feat: add budgeting client primitives"
```

### Task 4: Dashboard Monthly Budget, Net Worth, and Recent Activity

**Files:**
- Create: `client/components/BudgetOverview.tsx`
- Create: `client/components/NetWorthCard.tsx`
- Create: `client/components/RecentActivity.tsx`
- Modify: `client/pages/DashboardPage.tsx`
- Modify: `client/App.test.tsx`

**Interfaces:**
- Produces: the required top-of-Dashboard hierarchy and an inline monthly-budget editor.
- Consumes: `api.dashboard`, `api.monthlyAnalysis`, `api.netWorth`, `BudgetOverview`, `NetWorthCard`, and `RecentActivity`.

- [ ] **Step 1: Write a failing Dashboard composition test**

```tsx
it('places monthly budget, net worth, and recent activity before today', async () => {
  installApi(true);
  render(<App />);
  const budget = await screen.findByRole('heading', { name: 'Monthly budget' });
  const netWorth = screen.getByRole('heading', { name: 'Net worth' });
  const recent = screen.getByRole('heading', { name: 'Recent transactions' });
  const today = screen.getByRole('heading', { name: "Today's snapshot" });
  expect(budget.compareDocumentPosition(netWorth)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(netWorth.compareDocumentPosition(recent)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(recent.compareDocumentPosition(today)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByText('Income')).toBeVisible();
  expect(screen.getByText('Spending')).toBeVisible();
  expect(screen.getByText('Savings')).toBeVisible();
  expect(screen.getByText('Amount left')).toBeVisible();
  expect(screen.getByText('18.18%')).toBeVisible();
});
```

Mock the new endpoints with deterministic values and assert owned, owed, net worth status, a Food recent row, and an Income recent row.

- [ ] **Step 2: Run the component test and verify the new heading is absent**

Run: `npm.cmd test -- client/App.test.tsx`

Expected: FAIL because Monthly budget is not rendered.

- [ ] **Step 3: Build focused presentational components**

`BudgetOverview` renders month, salary, spending limit, savings target, the four actual metrics, score, and spending-limit remainder. An Edit button opens an inline form prefilled from the current saved/suggested configuration. Saving calls `onSave(input)`; it does not mutate totals locally.

`NetWorthCard` renders the server's manual assets, receivables, total owned, manual liabilities, borrowed debt, total owed, net worth, and status label.

`RecentActivity` renders at most five items. Transactions use `CategoryBadge`; income uses a green `CircleDollarSign` and its source/category. A See all link points to `/history`.

- [ ] **Step 4: Compose Dashboard data loading and refresh**

Derive current `YYYY-MM` with `Intl.DateTimeFormat` parts, not UTC string slicing. Load existing dashboard, monthly analysis, Net Worth, and Vault list with `Promise.all`. On budget save, await the PUT, then refetch monthly analysis. If any critical top-panel request fails, show one actionable alert while preserving successfully loaded existing dashboard content.

- [ ] **Step 5: Run Dashboard tests**

Run: `npm.cmd test -- client/App.test.tsx`

Expected: PASS, including the original server-provided daily totals assertion.

- [ ] **Step 6: Commit Dashboard summaries**

```powershell
git add client/pages/DashboardPage.tsx client/components/BudgetOverview.tsx client/components/NetWorthCard.tsx client/components/RecentActivity.tsx client/App.test.tsx
git commit -m "feat: add budget and net worth dashboard"
```

### Task 5: Income Entry, Categories, and Unified History

**Files:**
- Modify: `client/pages/AddPage.tsx`
- Modify: `client/pages/HistoryPage.tsx`
- Modify: `client/App.test.tsx`

**Interfaces:**
- Produces: Add-page Income mode, transaction category override, and income/category-aware History.
- Consumes: `api.createIncome`, categorized `api.createTransaction`, shared category types, and `CategoryBadge`.

- [ ] **Step 1: Write failing interaction tests**

```tsx
it('adds income with its source and category', async () => {
  const backend = installApi(true);
  window.history.pushState({}, '', '/add');
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('tab', { name: 'Income' }));
  await user.type(screen.getByLabelText('Income source'), 'Freelance site');
  await user.selectOptions(screen.getByLabelText('Income category'), 'freelance');
  await user.type(screen.getByLabelText('Amount'), '5000');
  await user.click(screen.getByRole('button', { name: 'Save income' }));
  expect(backend.calls.find(({ path }) => path === '/api/income')?.body)
    .toEqual({ source: 'Freelance site', category: 'freelance', amount: '5000' });
});

it('allows overriding a suggested spending category', async () => {
  const user = userEvent.setup();
  renderAuthenticatedAddPage();
  await user.type(screen.getByLabelText('Description'), 'Swiggy gift');
  await user.selectOptions(screen.getByLabelText('Category'), 'shopping');
  await user.type(screen.getByLabelText('Amount'), '100');
  await user.click(screen.getByRole('button', { name: 'Save transaction' }));
  expect(lastTransactionBody()).toEqual({ description: 'Swiggy gift', amount: '100', category: 'shopping' });
});
```

- [ ] **Step 2: Run component tests and verify Income mode failure**

Run: `npm.cmd test -- client/App.test.tsx`

Expected: FAIL because Income mode and category controls are absent.

- [ ] **Step 3: Add the fourth mode and category controls**

Change `EntryMode` to `transaction | income | lent | borrowed`. Income uses `CircleDollarSign`, source input, and a category select with Bonus, Freelance, Refund, Other. Transaction mode shows the eight spending categories and defaults to `categorizeTransaction(label)` until the user manually changes it. Changing modes resets category state.

- [ ] **Step 4: Extend History safely**

Add Income to the filter, icon, label map, item label function, deletion resource map, and empty-state copy. Transaction rows render their category label/icon/colors. Income amounts use a plus sign and green semantic class; spending uses a minus sign only in presentation, without altering stored positive amount strings.

- [ ] **Step 5: Run component tests**

Run: `npm.cmd test -- client/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit entry and History changes**

```powershell
git add client/pages/AddPage.tsx client/pages/HistoryPage.tsx client/App.test.tsx
git commit -m "feat: add income and categorized spending entry"
```

### Task 6: Vault Goals and Net Worth Editing

**Files:**
- Create: `client/components/VaultGoals.tsx`
- Create: `client/components/VaultGoals.test.tsx`
- Create: `client/components/NetWorthEditor.tsx`
- Create: `client/components/NetWorthEditor.test.tsx`
- Modify: `client/pages/DashboardPage.tsx`

**Interfaces:**
- Produces: create/contribute/archive Vault UI and manual asset/liability CRUD UI.
- Consumes: foundation CRUD endpoints and refetch callbacks owned by Dashboard.

- [ ] **Step 1: Write failing Vault and Net Worth interaction tests**

```tsx
it('creates a Trip Vault and adds money only after API success', async () => {
  const user = userEvent.setup();
  render(<VaultGoals vaults={[]} onRefresh={onRefresh} />);
  await user.click(screen.getByRole('button', { name: 'New Vault' }));
  await user.type(screen.getByLabelText('Goal name'), 'Trip');
  await user.type(screen.getByLabelText('Goal emoji'), '✈️');
  await user.type(screen.getByLabelText('Target amount'), '60000');
  await user.click(screen.getByRole('button', { name: 'Create Vault' }));
  expect(api.createVault).toHaveBeenCalledWith({ name: 'Trip', emoji: '✈️', targetAmount: '60000' });
  expect(onRefresh).toHaveBeenCalled();
});

it('creates a bank asset and refreshes net worth', async () => {
  const user = userEvent.setup();
  render(<NetWorthEditor assets={[]} liabilities={[]} onRefresh={onRefresh} />);
  await user.type(screen.getByLabelText('Asset name'), 'Savings account');
  await user.selectOptions(screen.getByLabelText('Asset type'), 'bank');
  await user.type(screen.getByLabelText('Current value'), '125000');
  await user.click(screen.getByRole('button', { name: 'Add asset' }));
  expect(api.createAsset).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd test -- client/components/VaultGoals.test.tsx client/components/NetWorthEditor.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement Vault Goals**

Render active goals first and archived goals in a collapsed section. Cards contain emoji, name, saved/target values, percentage, native progress element, optional date, Add money, and Archive. General Savings hides target/progress and keeps Add money. Forms surface API errors with `role="alert"` and disable only their own submitting action.

- [ ] **Step 4: Implement Net Worth editor**

Open the editor from Manage assets and liabilities on `NetWorthCard`. Use separate asset and liability forms and lists. Each row shows name, type, current value/balance, update, and delete actions. Require native confirmation before deletion. The editor never exposes receivables or borrowed debt as editable duplicates.

- [ ] **Step 5: Refresh authoritative data after mutations**

Dashboard owns `loadVaults` and `loadNetWorth`. After a contribution, refresh both Vaults and monthly analysis because Savings and Amount left changed. After asset/liability writes, refresh Net Worth only.

- [ ] **Step 6: Run focused and Dashboard tests**

Run: `npm.cmd test -- client/components/VaultGoals.test.tsx client/components/NetWorthEditor.test.tsx client/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit goal and worth editors**

```powershell
git add client/components/VaultGoals.tsx client/components/VaultGoals.test.tsx client/components/NetWorthEditor.tsx client/components/NetWorthEditor.test.tsx client/pages/DashboardPage.tsx
git commit -m "feat: add Vault and net worth controls"
```

### Task 7: Monthly Budget Analysis and Weekly Expense Tracker

**Files:**
- Create: `client/components/MonthlyBudgetAnalysis.tsx`
- Create: `client/components/WeeklyExpenseTracker.tsx`
- Create: `client/components/MonthlyBudgetAnalysis.test.tsx`
- Modify: `client/pages/AnalyticsPage.tsx`

**Interfaces:**
- Produces: first Analysis tab, month navigation, category strip, and Monday-Sunday tracker.
- Consumes: `api.monthlyAnalysis`, `CategoryBadge`, `MonthlyAnalysisData`.

- [ ] **Step 1: Write a failing first-tab test**

```tsx
it('shows month, total spending, colored categories, and Monday-Sunday totals', async () => {
  render(<MonthlyBudgetAnalysis initialMonth="2026-09" />);
  expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeVisible();
  expect(screen.getByText('Total spending')).toBeVisible();
  expect(screen.getByTestId('category-food')).toHaveTextContent('12,000.00');
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    expect(screen.getByText(day)).toBeVisible();
  }
});
```

Also assert previous/next month API queries and week navigation dates.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm.cmd test -- client/components/MonthlyBudgetAnalysis.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the first accessible tab**

Render month navigation, total spending, Budget Score, category amount/percentage cards, and `WeeklyExpenseTracker`. The tracker uses an ordered list of seven days, accessible day labels, scaled bars with numeric totals, and an empty-state baseline when maximum spending is zero. Clicking a day expands its activity list from the server response.

- [ ] **Step 4: Replace the old period picker with tabs**

Use buttons with `role="tab"`, `aria-selected`, `aria-controls`, roving keyboard focus for Left/Right arrows, and panels with `role="tabpanel"`. Labels are exactly Monthly Budget, Budgeting Breakdown, and Annual Report. Keep the page route `/analytics` for backward-compatible bookmarks while changing visible navigation copy to Analysis.

- [ ] **Step 5: Run monthly analysis tests**

Run: `npm.cmd test -- client/components/MonthlyBudgetAnalysis.test.tsx client/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the first Analysis tab**

```powershell
git add client/pages/AnalyticsPage.tsx client/components/MonthlyBudgetAnalysis.tsx client/components/MonthlyBudgetAnalysis.test.tsx client/components/WeeklyExpenseTracker.tsx
git commit -m "feat: add monthly budget analysis"
```

### Task 8: Budgeting Breakdown Calendar

**Files:**
- Create: `client/components/BudgetBreakdown.tsx`
- Create: `client/components/BreakdownCalendar.tsx`
- Create: `client/components/BudgetBreakdown.test.tsx`
- Modify: `client/pages/AnalyticsPage.tsx`

**Interfaces:**
- Produces: second Analysis tab with year/month selector, monthly summaries, calendar, and day details.
- Consumes: `api.budgetBreakdown` and `BudgetBreakdownData`.

- [ ] **Step 1: Write a failing calendar interaction test**

```tsx
it('switches months and opens income and expense details for a date', async () => {
  const user = userEvent.setup();
  render(<BudgetBreakdown initialYear="2026" initialMonth="2026-09" />);
  await user.click(await screen.findByRole('button', { name: /September.*budget/i }));
  const day = screen.getByRole('button', { name: /3 September.*income 5,000\.00.*expenses 1,200\.00/i });
  await user.click(day);
  expect(screen.getByRole('heading', { name: '3 September details' })).toBeVisible();
  expect(screen.getByText('Freelance site')).toBeVisible();
  expect(screen.getByText('Swiggy dinner')).toBeVisible();
});
```

Assert 12 month controls, blank leading calendar cells, correct leap-year day count, Vault marker, and mobile summary ordering.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm.cmd test -- client/components/BudgetBreakdown.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement month selector and summary**

Render January-December as a scrollable list of buttons showing Income, Spending, Savings, Amount left, and budget usage. A year input with previous/next buttons refetches. Clamp only the visual budget-usage bar to 100%; show the numeric server percentage unchanged.

- [ ] **Step 4: Implement semantic calendar and details**

Use a seven-column grid headed Monday-Sunday. Each day button's accessible name includes full date, income, expenses, savings, and marker counts. Visible cells show green income, orange expense, Vault icon, and subscription icon when nonzero. The selected-day panel renders category-aware transactions and green income rows. On desktop CSS places it beside the calendar; DOM order keeps summary and calendar before details on mobile.

- [ ] **Step 5: Run calendar tests**

Run: `npm.cmd test -- client/components/BudgetBreakdown.test.tsx client/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit budgeting breakdown**

```powershell
git add client/pages/AnalyticsPage.tsx client/components/BudgetBreakdown.tsx client/components/BudgetBreakdown.test.tsx client/components/BreakdownCalendar.tsx
git commit -m "feat: add calendar budget breakdown"
```

### Task 9: Annual Report and Accessible Charts

**Files:**
- Create: `client/components/AnnualReport.tsx`
- Create: `client/components/AccessibleCharts.tsx`
- Create: `client/components/AnnualReport.test.tsx`
- Modify: `client/pages/AnalyticsPage.tsx`

**Interfaces:**
- Produces: third Analysis tab and reusable accessible bar, line, and pie charts.
- Consumes: `api.annualReport`, `AnnualReportData`, and category presentation metadata.

- [ ] **Step 1: Write a failing Annual Report test**

```tsx
it('renders annual totals, graphs, pie charts, legends, and data tables', async () => {
  render(<AnnualReport initialYear="2026" />);
  expect(await screen.findByRole('heading', { name: '2026 annual report' })).toBeVisible();
  expect(screen.getByText('Annual income')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Monthly income versus spending chart' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Monthly savings trend' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Spending by category pie chart' })).toBeVisible();
  expect(screen.getByRole('table', { name: 'Monthly income and spending data' })).toBeVisible();
  expect(screen.getByText('Highest-spending month: September')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm.cmd test -- client/components/AnnualReport.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement chart primitives without financial recomputation**

Bar and line charts convert server amount strings to numbers only for relative SVG coordinates; the visible/table amounts remain original strings. Pie charts create conic-gradient segments from server percentages and include an adjacent legend. Every chart uses `role="img"` with a specific accessible name plus a visible data table. Zero-total pies show a neutral circle and No data label.

- [ ] **Step 4: Implement Annual Report**

Render year navigation, annual Income/Spending/Savings/Amount left, Budget Score, income-versus-spending chart, savings trend, category pie, income-source pie, highest-spending month, and best-saving month. Negative Amount left uses the warning style. Missing extrema display `No activity recorded`.

- [ ] **Step 5: Run Annual Report tests**

Run: `npm.cmd test -- client/components/AnnualReport.test.tsx client/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Annual Report**

```powershell
git add client/pages/AnalyticsPage.tsx client/components/AnnualReport.tsx client/components/AnnualReport.test.tsx client/components/AccessibleCharts.tsx
git commit -m "feat: add annual budgeting report"
```

### Task 10: Responsive Styling, Accessibility Regression, and Live-Surface Verification

**Files:**
- Modify: `client/styles.css`
- Modify: `client/components/AppShell.tsx`
- Modify: `client/App.test.tsx`
- Modify: `e2e/mobile-money-flow.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: final mobile/desktop presentation and end-to-end coverage for the non-automation feature set.
- Consumes: every component and API from Tasks 1-9.

- [ ] **Step 1: Add failing navigation and responsive semantic assertions**

In `App.test.tsx`, assert the navigation link is named Analysis, all three tabs are keyboard reachable, every form label has a control, and category rows retain visible labels. In Playwright, add a 390 x 844 project step that verifies Dashboard section order and a desktop step that verifies `.breakdown-layout` has two columns.

- [ ] **Step 2: Run component tests and verify styling/navigation failures**

Run: `npm.cmd test -- client/App.test.tsx client/components`

Expected: FAIL until navigation copy and CSS hooks exist.

- [ ] **Step 3: Add the budgeting visual system**

Extend root variables with category colors and soft backgrounds. Use orange for Food, blue for Travel, purple for Shopping, brown for Coffee, pink for Entertainment, green for Health, teal for Bills, and grey for Other. Add styles for budget hero, four-metric grid, score ring, recent activity, Vault cards, Net Worth status, tab strip, month rail, weekly tracker, calendar, charts, legends, and tables.

At 720 px, use two-column metric/Vault layouts. At 980 px, keep the current side rail and place calendar details beside the calendar. At 320 px, prevent horizontal page overflow; only category/month rails may scroll within their containers. Provide `:focus-visible`, minimum 44 px interactive targets, and reduced-motion overrides.

- [ ] **Step 4: Update navigation and documentation**

Change only the visible Analytics label to Analysis; keep route `/analytics`. Document new migration, API endpoints, calculations, category behavior, Vault/Net Worth semantics, and required verification commands in README.

- [ ] **Step 5: Run full non-database verification**

Run: `npm.cmd test`

Expected: all tests PASS with zero failures.

Run: `npm.cmd run typecheck`

Expected: exit 0.

Run: `npm.cmd run build`

Expected: exit 0.

Run: `npm.cmd run db:check`

Expected: exit 0.

- [ ] **Step 6: Run integration and browser verification when configured**

Run: `npm.cmd run test:integration`

Expected with migrated `TEST_DATABASE_URL`: PASS.

Run: `npm.cmd run test:e2e`

Expected with migrated `DATABASE_URL` and the app running: mobile Chromium and desktop Firefox PASS. If external configuration is absent, report those checks as blocked rather than passing.

- [ ] **Step 7: Commit the completed surfaces phase**

```powershell
git add client server shared e2e README.md
git commit -m "feat: complete budgeting dashboard and analysis"
```
