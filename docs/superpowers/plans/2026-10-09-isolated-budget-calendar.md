# Superseded: Isolated Budget Calendar Implementation Plan

This plan is superseded by `2026-10-09-budget-workspace.md`. Do not execute it.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first Budget Calendar tab whose configuration, expense entries, calculations, summaries, and charts use an isolated persisted pipeline and never merge with Ledgerly's existing transaction features.

**Architecture:** Add a `budget_calendar_` family of PostgreSQL tables, a dedicated store and `/api/budget-calendar` router, and a `/budget-calendar` React page. Pure shared calculation helpers produce exact decimal-string daily, weekly, and monthly results; client components consume only the new API while reusing Ledgerly's shell, authentication, response envelope, local timezone configuration, and visual language.

**Tech Stack:** React 19, React Router 7, Express 5, TypeScript 6, Drizzle ORM, Neon PostgreSQL, Zod 4, Decimal.js, Luxon, Vitest, Testing Library, Supertest, Playwright, CSS/SVG charts.

## Global Constraints

- Budget Calendar is a separate top-level tab at `/budget-calendar`.
- Budget Calendar code must not read from or write to `transactions`, `monthly_budgets`, income, History, Add, Analysis, subscription, Vault, lending, borrowing, or existing aggregate stores.
- New persistence tables use the `budget_calendar_` prefix.
- The initial included allocation is editable persisted data totaling exactly `10000.00`; grocery subtotal is `2020.00`, meal subtotal is `5280.00`, petrol is `500.00`, snacks are `1200.00`, and miscellaneous is `1000.00`.
- The independently editable weekly food target starts at `1900.00` and surfaces discrepancies without changing monthly allocations.
- Monetary persistence uses `numeric(20,2)` and authoritative calculations use Decimal.js or exact minor units, never JavaScript floating point.
- Selected and persisted dates remain `YYYY-MM-DD` local calendar strings and must not shift through UTC conversion.
- Existing cookie authentication, same-origin protection, error envelopes, database connection, and deployment workflow remain in place.
- No charting dependency is added; charts use accessible HTML/CSS/SVG plus textual or tabular equivalents.
- No destructive migration or automatic deployment is permitted.

## File and Responsibility Map

- `shared/budget-calendar.ts` — Zod request schemas and stable public Budget Calendar contracts.
- `server/budget-calendar/calculations.ts` — pure exact-money scheduling, status, aggregation, projection, and discrepancy functions.
- `server/budget-calendar/store.ts` — isolated persistence interface consumed by routes.
- `server/budget-calendar/drizzle-budget-calendar-store.ts` — queries only `budget_calendar_*` tables and composes calendar/summary/trend responses.
- `server/budget-calendar/routes.ts` — authenticated REST boundary and local-date/month validation.
- `server/db/schema.ts` — Drizzle declarations for the isolated tables.
- `drizzle/0003_budget_calendar.sql` — reversible-by-follow-up, additive table/index/seed migration.
- `client/pages/BudgetCalendarPage.tsx` — page-level tab state, month state, fetch refresh generation, and cross-panel coordination.
- `client/components/budget-calendar/BudgetCalendar.tsx` — month grid and date selection.
- `client/components/budget-calendar/BudgetDayEditor.tsx` — bottom-sheet/dialog daily CRUD and explicit-zero workflow.
- `client/components/budget-calendar/BudgetConfiguration.tsx` — category, month allocation, settings, rules, and override editing.
- `client/components/budget-calendar/BudgetTrends.tsx` — accessible persisted-data charts and summaries.
- `client/api.ts` — typed methods for only `/api/budget-calendar/*`.
- `client/styles.css` — responsive tab, calendar, sheet, form, summary, and chart styles.

---

### Task 1: Public Contracts and Exact Budget Calculations

**Files:**
- Create: `shared/budget-calendar.ts`
- Create: `server/budget-calendar/calculations.ts`
- Test: `shared/budget-calendar.test.ts`
- Test: `server/budget-calendar/calculations.test.ts`

**Interfaces:**
- Consumes: existing `moneySchema`, `monthSchema`, and `localDateSchema` from `shared/contracts.ts`.
- Produces: `BudgetCalendarCategory`, `BudgetCalendarRule`, `BudgetCalendarExpense`, `BudgetCalendarDay`, `BudgetCalendarMonthView`, `BudgetCalendarTrends`, request input types, `calculateDayBudget(input)`, `aggregateBudgetMonth(input)`, and `buildPlannedDays(input)`.

- [ ] **Step 1: Write failing schema tests**

```ts
it('accepts a local dated expense and rejects zero or floating precision beyond paise', () => {
  expect(createBudgetCalendarExpenseSchema.parse({
    expenseDate: '2026-10-09', categoryId: crypto.randomUUID(), amount: '250',
    description: 'Lunch', notes: '', idempotencyKey: crypto.randomUUID(),
  }).amount).toBe('250.00');
  expect(() => createBudgetCalendarExpenseSchema.parse({
    expenseDate: '2026-10-09', categoryId: crypto.randomUUID(), amount: '0',
    idempotencyKey: crypto.randomUUID(),
  })).toThrow();
  expect(() => budgetCalendarDateSchema.parse('2026-02-30')).toThrow();
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm.cmd test -- shared/budget-calendar.test.ts`

Expected: FAIL because `shared/budget-calendar.ts` and its schemas do not exist.

- [ ] **Step 3: Add the contracts and schemas**

```ts
function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}
export const budgetCalendarGroupSchema = z.enum([
  'grocery', 'meal', 'petrol', 'snacks', 'miscellaneous', 'other',
]);
export const budgetCalendarFrequencySchema = z.enum([
  'daily', 'weekly', 'monthly', 'specific_days',
]);
export const budgetCalendarDateSchema = localDateSchema.refine(isValidCalendarDate, {
  message: 'Date must be a valid calendar date',
});
export const createBudgetCalendarExpenseSchema = z.object({
  expenseDate: budgetCalendarDateSchema,
  categoryId: z.string().uuid(),
  amount: moneySchema,
  description: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});
export type BudgetCalendarDayStatus = 'missing' | 'under' | 'on' | 'over' | 'future';
export interface BudgetCalendarDay {
  date: string;
  plannedAmount: string;
  planSource: 'calculated' | 'override';
  actualAmount: string;
  remaining: string;
  variance: string;
  utilization: string | null;
  status: BudgetCalendarDayStatus;
  recordState: 'missing' | 'recorded_zero' | 'recorded_with_expenses';
  expenses: BudgetCalendarExpense[];
}
```

- [ ] **Step 4: Run the schema tests and verify GREEN**

Run: `npm.cmd test -- shared/budget-calendar.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing calculation tests**

```ts
it.each([
  ['200.00', '150.00', '50.00', '-50.00', '75.00', 'under'],
  ['200.00', '200.00', '0.00', '0.00', '100.00', 'on'],
  ['200.00', '250.00', '-50.00', '50.00', '125.00', 'over'],
])('calculates day status exactly', (planned, actual, remaining, variance, utilization, status) => {
  expect(calculateDayBudget({ planned, actual, recorded: true, future: false }))
    .toEqual({ remaining, variance, utilization, status });
});

it('treats zero planned positive spending as over budget without division', () => {
  expect(calculateDayBudget({ planned: '0.00', actual: '50.00', recorded: true, future: false }))
    .toEqual({ remaining: '-50.00', variance: '50.00', utilization: null, status: 'over' });
});
```

- [ ] **Step 6: Run calculation tests and verify RED**

Run: `npm.cmd test -- server/budget-calendar/calculations.test.ts`

Expected: FAIL because the pure calculation functions do not exist.

- [ ] **Step 7: Implement exact calculations and calendar scheduling**

```ts
export function calculateDayBudget(input: DayBudgetInput): DayBudgetResult {
  const planned = new Decimal(input.planned);
  const actual = new Decimal(input.actual);
  const remaining = planned.minus(actual);
  const variance = actual.minus(planned);
  const status = input.future ? 'future'
    : !input.recorded ? 'missing'
    : actual.lt(planned) ? 'under'
    : actual.eq(planned) ? 'on' : 'over';
  return {
    remaining: remaining.toFixed(2),
    variance: variance.toFixed(2),
    utilization: planned.eq(0) ? (actual.eq(0) ? '0.00' : null)
      : actual.div(planned).times(100).toFixed(2),
    status,
  };
}
```

Implement `buildPlannedDays` by enumerating real local date strings for the selected month, applying active rules by frequency and weekday/day-of-month, summing exact amounts, and finally replacing totals for dates present in the override map. Implement `aggregateBudgetMonth` so recorded averages and projections exclude missing days and future dates.

- [ ] **Step 8: Run all focused calculation tests and verify GREEN**

Run: `npm.cmd test -- shared/budget-calendar.test.ts server/budget-calendar/calculations.test.ts`

Expected: PASS for 28/29/30/31-day months, leap years, partial weeks, missing/zero distinction, category percentages, overrides, and projections.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- shared/budget-calendar.ts shared/budget-calendar.test.ts server/budget-calendar/calculations.ts server/budget-calendar/calculations.test.ts
git commit -m "feat: define isolated budget calendar calculations"
```

### Task 2: Additive Schema, Seed Data, and Migration

**Files:**
- Modify: `server/db/schema.ts`
- Modify: `server/db/schema.test.ts`
- Create: `drizzle/0003_budget_calendar.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0003_snapshot.json` through Drizzle generation

**Interfaces:**
- Consumes: schema enums and constraints described in the approved design.
- Produces: `budgetCalendarSettings`, `budgetCalendarCategories`, `budgetCalendarMonths`, `budgetCalendarRules`, `budgetCalendarOverrides`, `budgetCalendarExpenses`, and `budgetCalendarDayRecords` Drizzle tables.

- [ ] **Step 1: Write failing schema metadata tests**

```ts
it('declares isolated budget calendar tables without changing transaction columns', () => {
  expect(getTableName(budgetCalendarExpenses)).toBe('budget_calendar_expenses');
  expect(getTableName(budgetCalendarCategories)).toBe('budget_calendar_categories');
  expect(Object.keys(getTableColumns(transactions))).toEqual([
    'id', 'description', 'category', 'amount', 'createdAt',
  ]);
});
```

- [ ] **Step 2: Run schema test and verify RED**

Run: `npm.cmd test -- server/db/schema.test.ts`

Expected: FAIL because the new table exports do not exist.

- [ ] **Step 3: Declare prefixed tables with constraints and indexes**

```ts
export const budgetCalendarExpenses = pgTable('budget_calendar_expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  expenseDate: date('expense_date', { mode: 'string' }).notNull(),
  categoryId: uuid('category_id').notNull().references(() => budgetCalendarCategories.id),
  amount: money('amount'),
  description: varchar('description', { length: 200 }),
  notes: varchar('notes', { length: 500 }),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check('budget_calendar_expenses_amount_positive', sql`${table.amount} > 0`),
  index('budget_calendar_expenses_date_idx').on(table.expenseDate),
  index('budget_calendar_expenses_category_idx').on(table.categoryId),
]);
```

Add equivalent strongly constrained declarations for settings, categories, month snapshots, rules, overrides, and day records. `budget_calendar_categories` includes nullable unique `seedKey: varchar('seed_key', { length: 40 }).unique()` so the migration can idempotently insert built-ins while user-created categories leave it null. Do not modify existing table declarations.

- [ ] **Step 4: Generate and inspect the additive migration**

Run: `npm.cmd run db:generate`

Expected: `drizzle/0003_budget_calendar.sql` contains only `CREATE TABLE`, `CREATE INDEX`, foreign keys, checks, and inserts for `budget_calendar_*`; it contains no `DROP`, `ALTER transactions`, or `ALTER monthly_budgets` statement.

- [ ] **Step 5: Add conflict-safe seed statements**

```sql
INSERT INTO "budget_calendar_settings" ("id", "week_start", "weekly_food_target")
VALUES ('00000000-0000-4000-8000-000000000003', 1, 1900.00)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "budget_calendar_categories"
  ("seed_key", "name", "group_name", "monthly_amount", "included_in_overall_budget", "sort_order")
VALUES
  ('bananas', 'Bananas', 'grocery', 300.00, true, 10),
  ('dates', 'Dates', 'grocery', 300.00, true, 20),
  ('milk', 'Milk', 'grocery', 300.00, true, 30),
  ('eggs', 'Eggs', 'grocery', 420.00, true, 40),
  ('oats', 'Oats', 'grocery', 350.00, true, 50),
  ('peanut-butter', 'Peanut butter', 'grocery', 350.00, true, 60),
  ('breakfast', 'Breakfast', 'meal', 480.00, true, 70),
  ('lunch', 'Lunch', 'meal', 2400.00, true, 80),
  ('dinner', 'Dinner', 'meal', 2400.00, true, 90),
  ('petrol', 'Petrol', 'petrol', 500.00, true, 100),
  ('snacks', 'Snacks', 'snacks', 1200.00, true, 110),
  ('miscellaneous', 'Miscellaneous', 'miscellaneous', 1000.00, true, 120)
ON CONFLICT ("seed_key") DO NOTHING;
```

- [ ] **Step 6: Verify schema and tests**

Run: `npm.cmd run db:check`

Run: `npm.cmd test -- server/db/schema.test.ts`

Expected: both PASS; seed sum test reports `10000.00`, grocery `2020.00`, and meal `5280.00`.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- server/db/schema.ts server/db/schema.test.ts drizzle/0003_budget_calendar.sql drizzle/meta/_journal.json drizzle/meta/0003_snapshot.json
git commit -m "feat: add isolated budget calendar schema"
```

### Task 3: Configuration, Rules, and Month Persistence API

**Files:**
- Create: `server/budget-calendar/store.ts`
- Create: `server/budget-calendar/drizzle-budget-calendar-store.ts`
- Create: `server/budget-calendar/routes.ts`
- Create: `server/budget-calendar/routes.test.ts`
- Create: `server/budget-calendar/drizzle-budget-calendar-store.test.ts`
- Modify: `index.ts`

**Interfaces:**
- Consumes: Task 1 request/response contracts and Task 2 table exports.
- Produces: `BudgetCalendarStore` with `getSettings`, `updateSettings`, `listCategories`, `createCategory`, `updateCategory`, `archiveCategory`, `getMonth`, `updateMonth`, `listRules`, `createRule`, `updateRule`, `deleteRule`, `upsertOverride`, and `deleteOverride`; mounted `/api/budget-calendar` router.

- [ ] **Step 1: Write failing authenticated route tests**

```ts
it('keeps configuration behind existing authentication', async () => {
  await request(app).get('/api/budget-calendar/categories').expect(401);
  await authenticatedAgent.get('/api/budget-calendar/categories').expect(200)
    .expect(({ body }) => expect(body.data.items).toHaveLength(12));
});

it('updates a selected month without calling the existing budget store', async () => {
  await authenticatedAgent.put('/api/budget-calendar/months/2026-10').send({
    overallLimit: '10000',
    categories: seededCategoryInputs,
  }).expect(200);
  expect(store.updatedMonth).toBe('2026-10');
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm.cmd test -- server/budget-calendar/routes.test.ts`

Expected: FAIL because the store and router do not exist.

- [ ] **Step 3: Define the isolated store interface**

```ts
export interface BudgetCalendarStore {
  getSettings(): Promise<BudgetCalendarSettings>;
  updateSettings(input: UpdateBudgetCalendarSettingsInput): Promise<BudgetCalendarSettings>;
  listCategories(options?: { includeArchived?: boolean }): Promise<BudgetCalendarCategory[]>;
  createCategory(input: CreateBudgetCalendarCategoryInput): Promise<BudgetCalendarCategory>;
  updateCategory(id: string, input: UpdateBudgetCalendarCategoryInput): Promise<BudgetCalendarCategory | undefined>;
  archiveCategory(id: string): Promise<'archived' | 'deleted' | 'missing'>;
  getMonth(month: string): Promise<BudgetCalendarMonthConfiguration>;
  updateMonth(month: string, input: UpdateBudgetCalendarMonthInput): Promise<BudgetCalendarMonthConfiguration>;
  listRules(): Promise<BudgetCalendarRule[]>;
  createRule(input: CreateBudgetCalendarRuleInput): Promise<BudgetCalendarRule>;
  updateRule(id: string, input: UpdateBudgetCalendarRuleInput): Promise<BudgetCalendarRule | undefined>;
  deleteRule(id: string): Promise<boolean>;
  upsertOverride(date: string, input: UpsertBudgetCalendarOverrideInput): Promise<BudgetCalendarOverride>;
  deleteOverride(date: string): Promise<boolean>;
}
```

- [ ] **Step 4: Implement and mount configuration routes**

```ts
export function createBudgetCalendarRouter(store: BudgetCalendarStore): Router {
  const router = Router();
  router.get('/categories', async (_request, response) => {
    response.json({ success: true, data: { items: await store.listCategories() } });
  });
  router.put('/months/:month', async (request, response) => {
    const month = monthSchema.parse(request.params.month);
    const input = updateBudgetCalendarMonthSchema.parse(request.body);
    response.json({ success: true, data: await store.updateMonth(month, input) });
  });
  return router;
}
```

Mount only as `protectedRouter.use('/budget-calendar', createBudgetCalendarRouter(budgetCalendarStore, config.timezone))` in `index.ts`.

- [ ] **Step 5: Implement Drizzle configuration persistence**

Use Drizzle transactions for month snapshot replacement and for category archival checks. Queries in this file may import only `budgetCalendar*` table exports. `getMonth` lazily creates a stable category snapshot from active settings when the requested month does not exist.

- [ ] **Step 6: Run route/store tests and verify GREEN**

Run: `npm.cmd test -- server/budget-calendar/routes.test.ts server/budget-calendar/drizzle-budget-calendar-store.test.ts`

Expected: PASS for authentication, validation, settings, category CRUD/archive, historical month snapshots, rules, overrides, and absence of existing-store calls.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- server/budget-calendar index.ts
git commit -m "feat: add budget calendar configuration API"
```

### Task 4: Daily Expense, Explicit-Zero, and Idempotency API

**Files:**
- Modify: `server/budget-calendar/store.ts`
- Modify: `server/budget-calendar/drizzle-budget-calendar-store.ts`
- Modify: `server/budget-calendar/routes.ts`
- Modify: `server/budget-calendar/routes.test.ts`
- Modify: `server/budget-calendar/drizzle-budget-calendar-store.test.ts`

**Interfaces:**
- Consumes: `createBudgetCalendarExpenseSchema`, `updateBudgetCalendarExpenseSchema`, and local dates.
- Produces: `getDay`, `createExpense`, `updateExpense`, `deleteExpense`, and `setDayRecordState` store operations and REST endpoints.

- [ ] **Step 1: Write failing expense lifecycle tests**

```ts
it('returns the original expense when an idempotency key is retried', async () => {
  const input = {
    expenseDate: '2026-10-09', categoryId, amount: '250', description: 'Groceries',
    idempotencyKey: '4aa2d68c-d9dd-44da-bb79-c987829e2f50',
  };
  const first = await agent.post('/api/budget-calendar/expenses').send(input).expect(201);
  const retry = await agent.post('/api/budget-calendar/expenses').send(input).expect(200);
  expect(retry.body.data.id).toBe(first.body.data.id);
  expect(store.expenses).toHaveLength(1);
});

it('distinguishes missing, explicit zero, and positive expenses', async () => {
  expect((await agent.get('/api/budget-calendar/days/2026-10-09')).body.data.recordState)
    .toBe('missing');
  await agent.put('/api/budget-calendar/days/2026-10-09/record-state')
    .send({ recordedZero: true }).expect(200);
  expect((await agent.get('/api/budget-calendar/days/2026-10-09')).body.data.recordState)
    .toBe('recorded_zero');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- server/budget-calendar/routes.test.ts -t "idempotency|explicit zero|expense"`

Expected: FAIL because expense endpoints and operations do not exist.

- [ ] **Step 3: Implement transactional expense operations**

```ts
async createExpense(input: CreateBudgetCalendarExpenseInput) {
  return this.database.transaction(async (tx) => {
    const existing = await tx.query.budgetCalendarExpenses.findFirst({
      where: eq(budgetCalendarExpenses.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return { expense: asExpense(existing), created: false };
    await ensureActiveCategory(tx, input.categoryId);
    const [row] = await tx.insert(budgetCalendarExpenses).values(input).returning();
    await tx.delete(budgetCalendarDayRecords)
      .where(eq(budgetCalendarDayRecords.date, input.expenseDate));
    return { expense: asExpense(row), created: true };
  });
}
```

Updating preserves the original `idempotencyKey`. Deleting the final expense leaves the day missing unless the user separately records zero. Setting recorded zero is rejected while positive expenses exist.

- [ ] **Step 4: Add the routes with stable status codes**

`POST /expenses` returns `201` when created and `200` for an idempotent replay. Missing expense IDs return `404 BUDGET_CALENDAR_EXPENSE_NOT_FOUND`. Invalid/inactive categories return `400 BUDGET_CALENDAR_CATEGORY_INVALID`.

- [ ] **Step 5: Run focused expense tests and verify GREEN**

Run: `npm.cmd test -- server/budget-calendar/routes.test.ts server/budget-calendar/drizzle-budget-calendar-store.test.ts`

Expected: PASS for multiple same-day entries, retry safety, editing, deletion, zero recording, validation, and authorization.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- server/budget-calendar
git commit -m "feat: persist isolated calendar expenses"
```

### Task 5: Calendar, Weekly/Monthly Summaries, and Trends API

**Files:**
- Modify: `server/budget-calendar/store.ts`
- Modify: `server/budget-calendar/drizzle-budget-calendar-store.ts`
- Modify: `server/budget-calendar/routes.ts`
- Modify: `server/budget-calendar/routes.test.ts`
- Modify: `server/budget-calendar/drizzle-budget-calendar-store.test.ts`

**Interfaces:**
- Consumes: Task 1 calculations and Task 3/4 persisted records.
- Produces: `getCalendar(month, today)`, `getSummary(month, weekAnchor, today)`, and `getTrends(month, today)` responses.

- [ ] **Step 1: Write failing aggregate isolation tests**

```ts
it('aggregates only budget calendar expenses', async () => {
  await seedExistingTransaction({ amount: '9999.00', createdAt: octoberNinth });
  await seedBudgetCalendarExpense({ amount: '250.00', expenseDate: '2026-10-09' });
  const view = await store.getCalendar('2026-10', '2026-10-09');
  expect(view.days.find((day) => day.date === '2026-10-09')?.actualAmount).toBe('250.00');
  expect(JSON.stringify(view)).not.toContain('9999.00');
});
```

- [ ] **Step 2: Run aggregate tests and verify RED**

Run: `npm.cmd test -- server/budget-calendar/drizzle-budget-calendar-store.test.ts -t "aggregates|summary|trend"`

Expected: FAIL because calendar/summary/trend methods do not exist.

- [ ] **Step 3: Query isolated source rows and call pure calculators**

Load the selected month snapshot, active rules, date overrides, `budget_calendar_expenses`, and `budget_calendar_day_records`; do not join or union any existing Ledgerly table. Build every date in the month, then derive weekly ranges, category percentages, cumulative points, counts, utilization, and projection.

- [ ] **Step 4: Expose calendar and report routes**

```ts
router.get('/months/:month/calendar', async (request, response) => {
  const month = monthSchema.parse(request.params.month);
  response.json({ success: true, data: await store.getCalendar(month, localToday(timezone)) });
});
router.get('/months/:month/summary', async (request, response) => {
  const query = budgetCalendarSummaryQuerySchema.parse(request.query);
  response.json({ success: true, data: await store.getSummary(month, query.week, localToday(timezone)) });
});
```

- [ ] **Step 5: Run aggregate and boundary tests and verify GREEN**

Run: `npm.cmd test -- server/budget-calendar/calculations.test.ts server/budget-calendar/routes.test.ts server/budget-calendar/drizzle-budget-calendar-store.test.ts`

Expected: PASS for local today, cross-month weeks, month boundaries, all month lengths, missing values, actual zero, totals, percentages, cumulative series, projection, and pipeline isolation.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- server/budget-calendar
git commit -m "feat: aggregate budget calendar reporting"
```

### Task 6: Client API, Navigation, and Page State

**Files:**
- Modify: `client/api.ts`
- Modify: `client/components/AppShell.tsx`
- Modify: `client/App.tsx`
- Modify: `client/App.test.tsx`
- Create: `client/pages/BudgetCalendarPage.tsx`
- Create: `client/pages/BudgetCalendarPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 response types and Task 3-5 endpoints.
- Produces: `api.budgetCalendar*` methods and authenticated `/budget-calendar` route with Calendar, Trends, Categories, and Rules tabs.

- [ ] **Step 1: Write failing route/navigation tests**

```tsx
it('opens a separate Budget Calendar route without loading transaction APIs', async () => {
  installBudgetCalendarApi();
  window.history.pushState({}, '', '/budget-calendar');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Budget Calendar' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  expect(fetchPaths.some((path) => path.startsWith('/api/history'))).toBe(false);
  expect(fetchPaths.some((path) => path.startsWith('/api/analysis'))).toBe(false);
});
```

- [ ] **Step 2: Run client test and verify RED**

Run: `npm.cmd test -- client/App.test.tsx client/pages/BudgetCalendarPage.test.tsx`

Expected: FAIL because the route, navigation item, API methods, and page do not exist.

- [ ] **Step 3: Add typed API methods**

```ts
budgetCalendarMonth: (month: string) =>
  apiRequest<BudgetCalendarMonthConfiguration>(`/api/budget-calendar/months/${month}`),
budgetCalendarView: (month: string) =>
  apiRequest<BudgetCalendarMonthView>(`/api/budget-calendar/months/${month}/calendar`),
createBudgetCalendarExpense: (input: CreateBudgetCalendarExpenseInput) =>
  apiRequest<BudgetCalendarExpense>('/api/budget-calendar/expenses', {
    method: 'POST', body: JSON.stringify(input),
  }),
```

Add every configuration, expense, record-state, summary, and trends method; none may call an existing transaction endpoint.

- [ ] **Step 4: Add the fifth navigation item and route**

Use `CalendarDays` from `lucide-react`, label it `Budget Calendar`, set `to: '/budget-calendar'`, and add `<Route path="budget-calendar" element={<BudgetCalendarPage />} />`.

- [ ] **Step 5: Implement generation-safe page state**

`BudgetCalendarPage` owns `selectedMonth`, `selectedDate`, and `revision`. Each confirmed mutation increments `revision`; calendar, summary, and trends loaders include it in their request key and ignore stale results using a generation ref. Internal tabs use the same roving-tab behavior already present on `AnalyticsPage`.

- [ ] **Step 6: Run route and page tests and verify GREEN**

Run: `npm.cmd test -- client/App.test.tsx client/pages/BudgetCalendarPage.test.tsx`

Expected: PASS for navigation, route isolation, loading/error states, stale response protection, and keyboard tabs.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- client/api.ts client/App.tsx client/App.test.tsx client/components/AppShell.tsx client/pages/BudgetCalendarPage.tsx client/pages/BudgetCalendarPage.test.tsx
git commit -m "feat: add budget calendar application tab"
```

### Task 7: Mobile Calendar and Daily Expense Editor

**Files:**
- Create: `client/components/budget-calendar/BudgetCalendar.tsx`
- Create: `client/components/budget-calendar/BudgetCalendar.test.tsx`
- Create: `client/components/budget-calendar/BudgetDayEditor.tsx`
- Create: `client/components/budget-calendar/BudgetDayEditor.test.tsx`
- Modify: `client/pages/BudgetCalendarPage.tsx`
- Modify: `client/styles.css`

**Interfaces:**
- Consumes: `BudgetCalendarMonthView`, selected date, category list, and Task 6 API mutation methods.
- Produces: accessible month grid and responsive day editor that calls `onMutationComplete()` only after confirmed writes.

- [ ] **Step 1: Write failing calendar interaction tests**

```tsx
it('shows compact status, selects a local date, and returns to today', async () => {
  const user = userEvent.setup();
  render(<BudgetCalendar view={octoberView} today="2026-10-09" onMonthChange={onMonthChange} onSelectDate={onSelectDate} />);
  expect(screen.getByRole('button', { name: /9 October 2026.*planned 200\.00.*actual missing/i }))
    .toBeVisible();
  await user.click(screen.getByRole('button', { name: /9 October 2026/i }));
  expect(onSelectDate).toHaveBeenCalledWith('2026-10-09');
  await user.click(screen.getByRole('button', { name: 'Today' }));
  expect(onMonthChange).toHaveBeenCalledWith('2026-10');
});
```

- [ ] **Step 2: Run calendar tests and verify RED**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetCalendar.test.tsx`

Expected: FAIL because the calendar component does not exist.

- [ ] **Step 3: Implement a Monday-first compact calendar**

Render real leading/trailing calendar cells, planned amount, compact actual/status marker, legend, previous/next/Today buttons, `aria-pressed` selection, and full non-color accessible labels. Construct dates with string arithmetic helpers, never `toISOString()`.

- [ ] **Step 4: Write failing editor CRUD and calculation tests**

```tsx
it('previews exact overspending and saves once with a stable idempotency key', async () => {
  const user = userEvent.setup();
  render(<BudgetDayEditor day={planned200Day} categories={categories} onMutationComplete={refresh} />);
  await user.type(screen.getByLabelText('Actual spending'), '250');
  expect(screen.getByText('Exceeded by ₹50.00')).toBeVisible();
  expect(screen.getByText('125.00% utilized')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save expense' }));
  await user.dblClick(screen.getByRole('button', { name: /Saving|Save expense/ }));
  expect(api.createBudgetCalendarExpense).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Run editor tests and verify RED**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetDayEditor.test.tsx`

Expected: FAIL because the editor does not exist.

- [ ] **Step 6: Implement editor add/edit/delete/zero flows**

Use `inputMode="decimal"`, keep the save button reachable, generate one UUID per draft, disable actions while pending, preserve failed drafts, confirm deletions, and announce success/errors. Render a bottom sheet on narrow screens and a side dialog on larger screens with native dialog semantics (`role="dialog"`, label, Escape close, focus return).

- [ ] **Step 7: Add responsive status styling**

Define `.budget-calendar-grid`, `.budget-calendar-day`, status modifier classes, `.budget-day-sheet`, and a desktop media query. Five bottom-navigation items use `repeat(5, minmax(0, 1fr))`; labels remain visible without horizontal overflow.

- [ ] **Step 8: Run calendar/editor/page tests and verify GREEN**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetCalendar.test.tsx client/components/budget-calendar/BudgetDayEditor.test.tsx client/pages/BudgetCalendarPage.test.tsx`

Expected: PASS for month navigation, Today, local date preservation, missing/zero/under/on/over/future statuses, multiple expenses, edit/delete, duplicate-click protection, and keyboard interaction.

- [ ] **Step 9: Commit Task 7**

```powershell
git add -- client/components/budget-calendar client/pages/BudgetCalendarPage.tsx client/styles.css
git commit -m "feat: add mobile budget calendar editor"
```

### Task 8: Editable Categories, Month Allocation, Rules, and Overrides

**Files:**
- Create: `client/components/budget-calendar/BudgetConfiguration.tsx`
- Create: `client/components/budget-calendar/BudgetConfiguration.test.tsx`
- Modify: `client/pages/BudgetCalendarPage.tsx`
- Modify: `client/styles.css`

**Interfaces:**
- Consumes: configuration API methods and category/month/rule/override contracts.
- Produces: Categories and Rules panels with live exact totals and discrepancy preview.

- [ ] **Step 1: Write failing configuration tests**

```tsx
it('shows the seeded total and warns without mutating conflicting targets', async () => {
  render(<BudgetConfiguration month="2026-10" />);
  expect(await screen.findByText('₹10,000.00 allocated')).toBeVisible();
  expect(screen.getByText('Groceries ₹2,020.00')).toBeVisible();
  expect(screen.getByText('Meals ₹5,280.00')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(/₹1,900.*weekly food target.*does not match/i);
});

it('previews a date override before saving it', async () => {
  const user = userEvent.setup();
  render(<BudgetConfiguration month="2026-10" />);
  await user.click(await screen.findByRole('tab', { name: 'Rules' }));
  await user.type(screen.getByLabelText('Override date'), '2026-10-09');
  await user.type(screen.getByLabelText('Planned amount'), '200');
  expect(screen.getByText('9 October will use ₹200.00 instead of its calculated plan.')).toBeVisible();
});
```

- [ ] **Step 2: Run configuration tests and verify RED**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetConfiguration.test.tsx`

Expected: FAIL because the configuration component does not exist.

- [ ] **Step 3: Implement category and month allocation forms**

Render editable name, group, amount, inclusion, active state, and ordering. Calculate live totals with Decimal.js. Saving a month sends the complete selected-month snapshot explicitly; changing a global category never silently mutates a prior month.

- [ ] **Step 4: Implement settings, rule, and override forms**

Support week start, weekly food target, daily/weekly/monthly/specific-days frequency, amount, weekdays, day-of-month, active range, and date override. Show an exact affected-date preview and discrepancy message before save.

- [ ] **Step 5: Run configuration tests and verify GREEN**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetConfiguration.test.tsx client/pages/BudgetCalendarPage.test.tsx`

Expected: PASS for add/edit/archive, inclusion totals, historical snapshots, rule validation, override CRUD, schedule preview, and independent discrepancy warning.

- [ ] **Step 6: Commit Task 8**

```powershell
git add -- client/components/budget-calendar/BudgetConfiguration.tsx client/components/budget-calendar/BudgetConfiguration.test.tsx client/pages/BudgetCalendarPage.tsx client/styles.css
git commit -m "feat: add budget calendar configuration"
```

### Task 9: Persisted Summaries and Accessible Trends

**Files:**
- Create: `client/components/budget-calendar/BudgetTrends.tsx`
- Create: `client/components/budget-calendar/BudgetTrends.test.tsx`
- Modify: `client/pages/BudgetCalendarPage.tsx`
- Modify: `client/styles.css`

**Interfaces:**
- Consumes: `BudgetCalendarSummary` and `BudgetCalendarTrends` from Task 5 APIs.
- Produces: monthly/weekly cards, planned-versus-actual visualization, category distribution, weekly comparison, cumulative trend, utilization progress, and accessible data tables.

- [ ] **Step 1: Write failing persisted-data chart tests**

```tsx
it('renders persisted values and keeps missing days distinct from zero', () => {
  render(<BudgetTrends summary={summaryFixture} trends={trendsFixture} />);
  expect(screen.getByText('₹10,000.00')).toBeVisible();
  expect(screen.getByText('₹4,250.00')).toBeVisible();
  expect(screen.getByRole('progressbar', { name: 'Monthly budget utilization' }))
    .toHaveAttribute('aria-valuenow', '42.5');
  expect(screen.getByRole('table', { name: 'Daily planned and actual spending data' }))
    .toHaveTextContent('Not recorded');
  expect(screen.getByRole('table', { name: 'Daily planned and actual spending data' }))
    .toHaveTextContent('₹0.00 recorded');
});
```

- [ ] **Step 2: Run trends tests and verify RED**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetTrends.test.tsx`

Expected: FAIL because the trends component does not exist.

- [ ] **Step 3: Implement summary cards and accessible charts**

Use SVG with `role="img"` and accessible names for visual marks, and include visually available data tables. Render monthly budget, actual, remaining/exceeded, utilization, weekly plan/actual, recorded-day average, under/over counts, and a clearly labeled optional projection. Clamp only visual progress bar widths; display authoritative percentages unchanged.

- [ ] **Step 4: Add responsive chart styling and empty states**

Charts stack at mobile widths, have no horizontal page overflow, and may use an internal `.table-scroll` only for data tables. Empty actual data displays a useful message and planned series rather than fabricated zero spending.

- [ ] **Step 5: Run trends and page tests and verify GREEN**

Run: `npm.cmd test -- client/components/budget-calendar/BudgetTrends.test.tsx client/pages/BudgetCalendarPage.test.tsx`

Expected: PASS for all metrics, category amounts/percentages, partial weeks, missing data, recorded zero, projection labeling, and accessible chart alternatives.

- [ ] **Step 6: Commit Task 9**

```powershell
git add -- client/components/budget-calendar/BudgetTrends.tsx client/components/budget-calendar/BudgetTrends.test.tsx client/pages/BudgetCalendarPage.tsx client/styles.css
git commit -m "feat: visualize isolated budget calendar trends"
```

### Task 10: Integration, Responsive E2E, and Release Readiness

**Files:**
- Modify: `e2e/mobile-money-flow.spec.ts`
- Create: `e2e/budget-calendar.spec.ts`
- Modify: `README.md`
- Modify: `.env.example` only if an existing required value needs documentation; do not add a second database or secret.

**Interfaces:**
- Consumes: complete server and client feature.
- Produces: regression evidence, mobile/desktop interaction proof, migration/deployment instructions, and explicit local-versus-deployed status.

- [ ] **Step 1: Write the failing isolated-pipeline E2E scenario**

```ts
test('records a dated expense without changing History', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Budget Calendar' }).first().click();
  await page.getByRole('button', { name: /9 October 2026/i }).click();
  await page.getByLabel('Expense category').selectOption({ label: 'Lunch' });
  await page.getByLabel('Actual spending').fill('250');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByRole('status')).toContainText('Expense saved');
  await page.getByRole('link', { name: 'History' }).first().click();
  await expect(page.getByText('Lunch', { exact: true })).toHaveCount(0);
});
```

- [ ] **Step 2: Run focused E2E and confirm it initially exposes missing integration**

Run: `npx.cmd playwright test e2e/budget-calendar.spec.ts --project=mobile-chromium`

Expected before final fixture wiring: FAIL at the first unimplemented or unseeded integration boundary, not from a selector syntax error.

- [ ] **Step 3: Complete disposable test setup and responsive assertions**

Reuse the established authentication and database cleanup helpers. Assert no horizontal overflow, touch-sized primary actions, visible bottom sheet on Pixel 5, side dialog on desktop Firefox, keyboard focus return, month navigation, Today, add/edit/delete, explicit zero, charts, and route isolation.

- [ ] **Step 4: Run focused and full automated verification**

Run: `npm.cmd test -- shared/budget-calendar.test.ts server/budget-calendar client/components/budget-calendar client/pages/BudgetCalendarPage.test.tsx`

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run db:check`

Run: `npm.cmd run build`

Run: `npm.cmd run test:integration`

Run: `npx.cmd playwright test e2e/budget-calendar.spec.ts`

Expected: all applicable commands PASS. If disposable database credentials are unavailable, report integration/E2E as blocked rather than converting them to mock-data proof.

- [ ] **Step 5: Verify isolation and migration content explicitly**

Run: `rg -n "transactions|monthly_budgets|createTransaction|/api/transactions|/api/analysis" server/budget-calendar client/components/budget-calendar client/pages/BudgetCalendarPage.tsx`

Expected: no production import, query, or request to existing financial pipelines; references are allowed only in tests that assert isolation.

Run: `rg -n "DROP|ALTER TABLE .*transactions|ALTER TABLE .*monthly_budgets" drizzle/0003_budget_calendar.sql`

Expected: no matches.

- [ ] **Step 6: Document operation and deployment boundaries**

Add README sections for the `/budget-calendar` route, additive migration, isolated data ownership, seed configuration, local verification commands, and the fact that `npm run start` applies migrations before server startup. Do not claim production deployment from local results.

- [ ] **Step 7: Run final diff and repository checks**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only intended feature, test, migration, documentation, and generated Drizzle metadata files are changed.

- [ ] **Step 8: Commit Task 10**

```powershell
git add -- e2e/budget-calendar.spec.ts e2e/mobile-money-flow.spec.ts README.md .env.example
git commit -m "test: verify isolated budget calendar workflow"
```

## Completion Report

The implementation handoff must state:

1. Which Budget Calendar routes, tables, components, and calculations were added.
2. The migration filename and confirmation that it does not alter existing financial tables.
3. The exact ₹10,000 seed breakdown and planning-rule behavior.
4. Focused tests, full tests, typecheck, schema check, build, integration tests, and E2E results as separate evidence tiers.
5. Any skipped or blocked checks and why.
6. Whether changes are local, committed, pushed, deployed, or live-verified; never infer deployment from a local build.
