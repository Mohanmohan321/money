# Budgeting Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the persistent domain model, calculations, migrations, and authenticated APIs required by monthly budgets, income, categories, Vault savings, and Net Worth.

**Architecture:** Keep validation and API types in `shared`, pure financial arithmetic in a focused shared module, and persistence behind small server store interfaces. Drizzle stores own SQL and row mapping; routers own HTTP validation and response envelopes. Existing transaction/lending/borrowing endpoints remain backward compatible.

**Tech Stack:** TypeScript 6, Zod 4, Decimal.js, Express 5, Drizzle ORM, PostgreSQL/Neon, Vitest, Supertest

## Global Constraints

- The application remains private and single-user; every new route is mounted behind the existing session middleware.
- Use `NUMERIC(20, 2)` and decimal strings for money; JavaScript number arithmetic is forbidden for financial calculations.
- Event amounts and current values must be positive; monthly salary, spending limit, and savings target may be zero but never negative.
- Month keys use `YYYY-MM`; report years use four digits; timestamps remain server-generated `TIMESTAMPTZ` and are grouped in `APP_TIMEZONE`.
- Spending includes normal transactions only. Lending, borrowing, assets, liabilities, and Vault transfers are excluded.
- Savings equals confirmed Vault contributions. Amount left equals income minus spending minus savings.
- Budget Score equals savings divided by income times 100, clamped to 0-100; zero income produces a zero score.
- One configured display currency is assumed; do not add exchange rates or currency conversion.
- Preserve all existing authentication, origin, timestamp, validation, and error-envelope behavior.

---

## File Structure

- `shared/contracts.ts`: request schemas and API response types.
- `shared/budgeting.ts`: pure category classification and Decimal.js budget arithmetic.
- `server/db/schema.ts`: Drizzle table definitions and constraints.
- `server/budgets/*`: monthly budget and additional-income persistence and routes.
- `server/vaults/*`: Vault and contribution persistence and routes.
- `server/net-worth/*`: asset, liability, and net-worth persistence and routes.
- `server/records/*`: additive transaction-category support.
- `server/aggregates/*`: unified History support for income.
- `index.ts`: production dependency composition only.

### Task 1: Shared Budget Contracts, Classification, and Arithmetic

**Files:**
- Create: `shared/budgeting.ts`
- Create: `shared/budgeting.test.ts`
- Modify: `shared/contracts.ts`
- Modify: `shared/contracts.test.ts`

**Interfaces:**
- Produces: `SpendingCategory`, `IncomeCategory`, `MonthlyBudget`, `BudgetSummary`, `IncomeRecord`, `categorizeTransaction(description)`, and `calculateBudgetSummary(input)`.
- Consumes: Decimal.js and the existing fixed two-decimal money convention.

- [ ] **Step 1: Write failing contract and arithmetic tests**

```ts
import { describe, expect, it } from 'vitest';
import { calculateBudgetSummary, categorizeTransaction } from './budgeting';
import { createIncomeSchema, createTransactionSchema, upsertBudgetSchema } from './contracts';

describe('budgeting domain', () => {
  it.each([
    ['Swiggy dinner', 'food'],
    ['Uber airport', 'travel'],
    ['Amazon order', 'shopping'],
    ['Starbucks', 'coffee'],
    ['Netflix', 'entertainment'],
    ['Apollo pharmacy', 'health'],
    ['Electricity bill', 'bills'],
    ['Notebook', 'other'],
  ] as const)('classifies %s as %s', (description, category) => {
    expect(categorizeTransaction(description)).toBe(category);
  });

  it('calculates the server-facing budget summary with Decimal values', () => {
    expect(calculateBudgetSummary({
      salary: '50000.00', additionalIncome: '5000.00', spending: '12000.00',
      savings: '10000.00', spendingLimit: '20000.00',
    })).toEqual({
      income: '55000.00', spending: '12000.00', savings: '10000.00',
      amountLeft: '33000.00', budgetScore: '18.18', spendingRemaining: '8000.00',
    });
  });

  it('accepts zero plan values and strips generated fields', () => {
    expect(upsertBudgetSchema.parse({ salary: '0', spendingLimit: '20000', savingsTarget: '5000' }))
      .toEqual({ salary: '0.00', spendingLimit: '20000.00', savingsTarget: '5000.00' });
    expect(createIncomeSchema.parse({ source: ' Bonus ', category: 'bonus', amount: '1250' }))
      .toEqual({ source: 'Bonus', category: 'bonus', amount: '1250.00' });
    expect(createTransactionSchema.parse({ description: 'Swiggy', amount: '25', category: 'food' }).category)
      .toBe('food');
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the missing exports fail**

Run: `npm.cmd test -- shared/budgeting.test.ts shared/contracts.test.ts`

Expected: FAIL because the budgeting module and new schemas do not exist.

- [ ] **Step 3: Implement exact schemas, types, classifier rules, and arithmetic**

Add these public shapes to `shared/contracts.ts`:

```ts
export const spendingCategorySchema = z.enum([
  'food', 'travel', 'shopping', 'coffee', 'entertainment', 'health', 'bills', 'other',
]);
export const incomeCategorySchema = z.enum(['bonus', 'freelance', 'refund', 'other']);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM');
export const planMoneySchema = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/)
  .transform(normalizeMoney).refine((value) => value.split('.')[0].length <= 18, 'Amount is too large');
export const upsertBudgetSchema = z.object({
  salary: planMoneySchema,
  spendingLimit: planMoneySchema,
  savingsTarget: planMoneySchema,
});
export const createIncomeSchema = z.object({
  source: descriptionSchema,
  category: incomeCategorySchema,
  amount: moneySchema,
});
export const createTransactionSchema = z.object({
  description: descriptionSchema,
  amount: moneySchema,
  category: spendingCategorySchema.optional(),
});
```

Extract the current money-normalization transform into a private `normalizeMoney(value: string): string` so both money schemas return fixed two-decimal strings. Define records with these exact fields:

```ts
export type SpendingCategory = z.infer<typeof spendingCategorySchema>;
export type IncomeCategory = z.infer<typeof incomeCategorySchema>;
export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export interface TransactionRecord {
  id: string; description: string; category: SpendingCategory; amount: string; createdAt: string;
}
export interface MonthlyBudget {
  month: string; salary: string; spendingLimit: string; savingsTarget: string;
  source: 'saved' | 'suggested'; updatedAt?: string;
}
export interface IncomeRecord {
  id: string; source: string; category: IncomeCategory; amount: string; createdAt: string;
}
export interface BudgetSummary {
  income: string; spending: string; savings: string; amountLeft: string;
  budgetScore: string; spendingRemaining: string;
}
```

Implement `shared/budgeting.ts` with ordered, case-insensitive keyword arrays. First match wins. Use Decimal for every operation:

```ts
export function calculateBudgetSummary(input: {
  salary: string; additionalIncome: string; spending: string; savings: string; spendingLimit: string;
}): BudgetSummary {
  const income = new Decimal(input.salary).plus(input.additionalIncome);
  const spending = new Decimal(input.spending);
  const savings = new Decimal(input.savings);
  const score = income.isZero() ? new Decimal(0) : savings.div(income).mul(100);
  return {
    income: income.toFixed(2), spending: spending.toFixed(2), savings: savings.toFixed(2),
    amountLeft: income.minus(spending).minus(savings).toFixed(2),
    budgetScore: Decimal.max(0, Decimal.min(100, score)).toFixed(2),
    spendingRemaining: new Decimal(input.spendingLimit).minus(spending).toFixed(2),
  };
}
```

- [ ] **Step 4: Run shared tests and verify they pass**

Run: `npm.cmd test -- shared/budgeting.test.ts shared/contracts.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the shared domain**

```powershell
git add shared/contracts.ts shared/contracts.test.ts shared/budgeting.ts shared/budgeting.test.ts
git commit -m "feat: define budgeting domain contracts"
```

### Task 2: Drizzle Schema and Migration

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/schema.test.ts`
- Create: `drizzle/0001_budgeting_foundation.sql` through `npm.cmd run db:generate`
- Modify: `drizzle/meta/_journal.json`
- Create: generated Drizzle metadata snapshot

**Interfaces:**
- Consumes: category and status string values defined in Task 1.
- Produces: `monthlyBudgets`, `income`, `vaults`, `vaultContributions`, `assets`, and `liabilities` table exports plus `transactions.category`.

- [ ] **Step 1: Write a failing schema-shape test**

```ts
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { assets, income, liabilities, monthlyBudgets, transactions, vaultContributions, vaults } from './schema';

describe('budgeting schema', () => {
  it('exports every persistent budgeting column', () => {
    expect(Object.keys(getTableColumns(monthlyBudgets))).toEqual(['month', 'salary', 'spendingLimit', 'savingsTarget', 'createdAt', 'updatedAt']);
    expect(Object.keys(getTableColumns(income))).toContain('category');
    expect(Object.keys(getTableColumns(transactions))).toContain('category');
    expect(Object.keys(getTableColumns(vaults))).toContain('targetAmount');
    expect(Object.keys(getTableColumns(vaultContributions))).toContain('vaultId');
    expect(Object.keys(getTableColumns(assets))).toContain('currentValue');
    expect(Object.keys(getTableColumns(liabilities))).toContain('outstandingBalance');
  });
});
```

- [ ] **Step 2: Run the schema test and verify missing exports fail**

Run: `npm.cmd test -- server/db/schema.test.ts`

Expected: FAIL on missing table exports.

- [ ] **Step 3: Add tables, indexes, foreign keys, and checks**

Use `varchar('category', { length: 24 })` for category fields, `date('target_date', { mode: 'string' })` for target dates, UUID primary keys for event/entity tables, `month` as the monthly-budget primary key, and these exact constraints:

```ts
check('monthly_budgets_salary_non_negative', sql`${table.salary} >= 0`)
check('monthly_budgets_spending_limit_non_negative', sql`${table.spendingLimit} >= 0`)
check('monthly_budgets_savings_target_non_negative', sql`${table.savingsTarget} >= 0`)
check('income_amount_positive', sql`${table.amount} > 0`)
check('vaults_target_amount_positive', sql`${table.targetAmount} > 0`)
check('vault_contributions_amount_positive', sql`${table.amount} > 0`)
check('assets_current_value_positive', sql`${table.currentValue} > 0`)
check('liabilities_outstanding_balance_positive', sql`${table.outstandingBalance} > 0`)
```

Add `updatedAt` with `defaultNow()` to mutable entities and set it explicitly in update queries. Add indexes on all event timestamps and `vault_contributions.vault_id`. Give existing transactions a non-null `other` migration default, then remove the runtime default from application inserts by always resolving the category in the store.

- [ ] **Step 4: Generate the migration and inspect it**

Run: `npm.cmd run db:generate -- --name budgeting_foundation`

Expected: a migration adds six tables, the category column, checks, indexes, and the Vault foreign key without dropping current tables or data.

- [ ] **Step 5: Run schema and migration checks**

Run: `npm.cmd test -- server/db/schema.test.ts`

Expected: PASS.

Run: `npm.cmd run db:check`

Expected: exit 0 with a consistent migration history.

- [ ] **Step 6: Commit schema and migration**

```powershell
git add server/db/schema.ts server/db/schema.test.ts drizzle
git commit -m "feat: add budgeting database schema"
```

### Task 3: Monthly Budgets and Income API

**Files:**
- Create: `server/budgets/store.ts`
- Create: `server/budgets/drizzle-budget-store.ts`
- Create: `server/budgets/routes.ts`
- Create: `server/budgets/routes.test.ts`
- Modify: `shared/contracts.ts`

**Interfaces:**
- Produces: `BudgetStore.getBudget(month)`, `BudgetStore.upsertBudget(month, input)`, income CRUD, `createBudgetRouter(store, timezone)`, `GET/PUT /api/budgets/:month`, and CRUD `/api/income`.
- Consumes: `MonthlyBudget`, `IncomeRecord`, `upsertBudgetSchema`, `createIncomeSchema`, and `localDateBounds`.

- [ ] **Step 1: Write failing route tests for saved, suggested, and income behavior**

```ts
it('returns a carry-forward suggestion without saving it', async () => {
  store.saved.set('2026-08', savedAugust);
  const response = await agent.get('/api/budgets/2026-09').expect(200);
  expect(response.body.data).toEqual(expect.objectContaining({
    month: '2026-09', salary: '50000.00', source: 'suggested',
  }));
  expect(store.saved.has('2026-09')).toBe(false);
});

it('upserts a month and creates additional income with server time', async () => {
  await agent.put('/api/budgets/2026-09').send({
    salary: '50000', spendingLimit: '20000', savingsTarget: '10000',
  }).expect(200);
  const income = await agent.post('/api/income').send({
    source: 'Freelance site', category: 'freelance', amount: '5000',
  }).expect(201);
  expect(income.body.data).toEqual(expect.objectContaining({ amount: '5000.00', category: 'freelance' }));
  expect(income.body.data.createdAt).toMatch(/Z$/);
});
```

Also test invalid month, negative plan value, unknown income category, date-filter conversion, lookup, and delete-not-found using the existing error envelope.

- [ ] **Step 2: Run the route test and verify module-not-found failure**

Run: `npm.cmd test -- server/budgets/routes.test.ts`

Expected: FAIL because the budget router and store do not exist.

- [ ] **Step 3: Define the store contract and route surface**

```ts
export interface BudgetStore {
  getBudget(month: string): Promise<MonthlyBudget>;
  upsertBudget(month: string, input: UpsertBudgetInput): Promise<MonthlyBudget>;
  createIncome(input: CreateIncomeInput): Promise<IncomeRecord>;
  listIncome(filters: ListFilters): Promise<IncomeRecord[]>;
  getIncome(id: string): Promise<IncomeRecord | undefined>;
  deleteIncome(id: string): Promise<boolean>;
}
```

`getBudget` first looks for the requested month. If absent, it selects the latest earlier row and returns its three plan values with `month` changed and `source: 'suggested'`; if no earlier row exists, it returns zero values. `upsertBudget` uses PostgreSQL `ON CONFLICT (month) DO UPDATE` and returns `source: 'saved'`.

Mount budgets before `/:id` income routes. Parse UUIDs with the same error style as records. Return 404 code `INCOME_NOT_FOUND` for missing income.

- [ ] **Step 4: Implement Drizzle mapping and the router**

Map every numeric value with `String(row.amount)` and every timestamp with `toISOString()`. Do not use `Number` for money. Use `localDateBounds` for income list filters.

- [ ] **Step 5: Run budget route and shared contract tests**

Run: `npm.cmd test -- server/budgets/routes.test.ts shared/contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit budget and income APIs**

```powershell
git add shared/contracts.ts server/budgets
git commit -m "feat: add monthly budget and income APIs"
```

### Task 4: Vault Goals and Savings Contributions

**Files:**
- Create: `server/vaults/store.ts`
- Create: `server/vaults/drizzle-vault-store.ts`
- Create: `server/vaults/routes.ts`
- Create: `server/vaults/routes.test.ts`
- Modify: `shared/contracts.ts`

**Interfaces:**
- Produces: `Vault`, `VaultContribution`, `VaultStore`, CRUD `/api/vaults`, `POST /api/vaults/:id/contributions`, and `POST /api/vaults/:id/archive`.
- Consumes: positive money validation and optional `YYYY-MM-DD` target dates.

- [ ] **Step 1: Write failing tests for progress, contribution, and archive rules**

```ts
it('adds a contribution and returns Decimal progress', async () => {
  const created = await agent.post('/api/vaults').send({
    name: 'New phone', emoji: '📱', targetAmount: '80000', targetDate: '2027-01-15',
  }).expect(201);
  const id = created.body.data.id;
  await agent.post(`/api/vaults/${id}/contributions`).send({ amount: '20000' }).expect(201);
  const list = await agent.get('/api/vaults').expect(200);
  expect(list.body.data.items[0]).toEqual(expect.objectContaining({
    savedAmount: '20000.00', progressPercent: '25.00', status: 'active',
  }));
});

it('archives a funded Vault instead of deleting it', async () => {
  await agent.delete(`/api/vaults/${fundedVaultId}`).expect(409)
    .expect(({ body }) => expect(body.error.code).toBe('VAULT_HAS_CONTRIBUTIONS'));
  await agent.post(`/api/vaults/${fundedVaultId}/archive`).expect(200);
});
```

Also verify emoji/name limits, positive targets/contributions, invalid dates, missing Vaults, and creation of General Savings when none exists.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm.cmd test -- server/vaults/routes.test.ts`

Expected: FAIL on missing Vault APIs.

- [ ] **Step 3: Add Vault schemas and public types**

```ts
export const createVaultSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().min(1).max(16),
  targetAmount: moneySchema,
  targetDate: localDateSchema.optional(),
});
export const createVaultContributionSchema = z.object({ amount: moneySchema });
export interface Vault {
  id: string; name: string; emoji: string; targetAmount: string; targetDate?: string;
  status: 'active' | 'archived'; savedAmount: string; progressPercent: string;
  createdAt: string; updatedAt: string;
}
export interface VaultContribution {
  id: string; vaultId: string; amount: string; createdAt: string;
}
export type CreateVaultInput = z.infer<typeof createVaultSchema>;
export type CreateVaultContributionInput = z.infer<typeof createVaultContributionSchema>;
```

- [ ] **Step 4: Implement the store and router**

List Vaults with a left join and `COALESCE(sum(vault_contributions.amount), 0)`. Calculate percentage with Decimal.js and do not clamp progress, so overfunded goals can show more than 100%. Create General Savings lazily with name `General Savings`, emoji `💰`, and target amount `1.00`; the UI treats this target as open-ended and hides its progress bar.

Wrap the existence check and contribution insert in `database.transaction`. Return stable codes `VAULT_NOT_FOUND`, `VAULT_HAS_CONTRIBUTIONS`, and `VAULT_ARCHIVED`.

- [ ] **Step 5: Run Vault tests**

Run: `npm.cmd test -- server/vaults/routes.test.ts shared/contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Vault support**

```powershell
git add shared/contracts.ts server/vaults
git commit -m "feat: add savings Vault APIs"
```

### Task 5: Assets, Liabilities, and Net Worth

**Files:**
- Create: `server/net-worth/store.ts`
- Create: `server/net-worth/drizzle-net-worth-store.ts`
- Create: `server/net-worth/routes.ts`
- Create: `server/net-worth/routes.test.ts`
- Modify: `shared/contracts.ts`

**Interfaces:**
- Produces: asset/liability CRUD, `NetWorthSummary`, and `GET /api/net-worth`.
- Consumes: existing money-lent and money-borrowed tables as receivable and borrowed-debt totals.

- [ ] **Step 1: Write failing CRUD and composition tests**

```ts
it('composes owned, owed, and net worth without double counting', async () => {
  store.manualAssets = '300000.00';
  store.receivables = '20000.00';
  store.manualLiabilities = '70000.00';
  store.borrowedDebt = '10000.00';
  const response = await agent.get('/api/net-worth').expect(200);
  expect(response.body.data).toEqual({
    manualAssets: '300000.00', receivables: '20000.00', totalOwned: '320000.00',
    manualLiabilities: '70000.00', borrowedDebt: '10000.00', totalOwed: '80000.00',
    netWorth: '240000.00', status: 'positive',
  });
});
```

Add route tests for asset and liability create/list/update/delete, positive values, bounded notes, invalid types, missing IDs, zero net-worth status, and negative status.

- [ ] **Step 2: Run the route test and verify failure**

Run: `npm.cmd test -- server/net-worth/routes.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add exact types and schemas**

```ts
export const assetTypeSchema = z.enum(['cash', 'bank', 'investment', 'property', 'vehicle', 'other']);
export const liabilityTypeSchema = z.enum(['loan', 'credit-card', 'mortgage', 'other']);
export interface AssetRecord {
  id: string; name: string; type: z.infer<typeof assetTypeSchema>; currentValue: string;
  note?: string; createdAt: string; updatedAt: string;
}
export interface LiabilityRecord {
  id: string; name: string; type: z.infer<typeof liabilityTypeSchema>; outstandingBalance: string;
  note?: string; createdAt: string; updatedAt: string;
}
export interface NetWorthSummary {
  manualAssets: string; receivables: string; totalOwned: string;
  manualLiabilities: string; borrowedDebt: string; totalOwed: string;
  netWorth: string; status: 'positive' | 'negative' | 'zero';
}
```

Create and update payloads use `name`, `type`, the resource-specific money field, and optional `note` limited to 500 trimmed characters.

- [ ] **Step 4: Implement store queries and routes**

Use one aggregate SQL statement with scalar subqueries for manual assets, money lent, manual liabilities, and money borrowed. Convert the four returned strings to Decimal values, then compute totals and status. Keep each component in the response so the UI can explain the calculation.

- [ ] **Step 5: Run Net Worth tests**

Run: `npm.cmd test -- server/net-worth/routes.test.ts shared/contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Net Worth support**

```powershell
git add shared/contracts.ts server/net-worth
git commit -m "feat: add net worth tracking APIs"
```

### Task 6: Transaction Categories, Income History, and Application Composition

**Files:**
- Modify: `server/records/drizzle-record-store.ts`
- Modify: `server/records/routes.test.ts`
- Modify: `server/aggregates/drizzle-aggregate-store.ts`
- Modify: `server/aggregates/routes.test.ts`
- Modify: `server/aggregates/store.ts`
- Modify: `server/db/integration.test.ts`
- Modify: `index.ts`

**Interfaces:**
- Produces: backward-compatible classified transaction creation; `income` History items; production wiring for all foundation routers/stores.
- Consumes: `categorizeTransaction`, `createBudgetRouter`, `createVaultRouter`, `createNetWorthRouter`, and their Drizzle stores.

- [ ] **Step 1: Add failing compatibility and History tests**

Extend records tests with:

```ts
it('infers a category when omitted and preserves an explicit override', async () => {
  const inferred = await agent.post('/api/transactions').send({ description: 'Swiggy', amount: '20' }).expect(201);
  expect(inferred.body.data.category).toBe('food');
  const overridden = await agent.post('/api/transactions').send({
    description: 'Swiggy gift card', amount: '20', category: 'shopping',
  }).expect(201);
  expect(overridden.body.data.category).toBe('shopping');
});
```

Extend aggregate tests so `recordTypeSchema` accepts `income`, History returns an income item with `source` and `category`, and all pre-existing record types remain unchanged.

- [ ] **Step 2: Run focused tests and verify expected failures**

Run: `npm.cmd test -- server/records/routes.test.ts server/aggregates/routes.test.ts`

Expected: FAIL because transaction results lack category and History excludes income.

- [ ] **Step 3: Implement category resolution and income History**

In `createTransaction`, insert:

```ts
const values = { ...input, category: input.category ?? categorizeTransaction(input.description) };
```

Return category from every transaction mapper. Add income to the History union with type `income`, `source`, `category`, amount, and createdAt. Extend query filtering and `asHistoryItem` without altering existing ordering or pagination.

- [ ] **Step 4: Wire production stores and routers**

Instantiate `DrizzleBudgetStore`, `DrizzleVaultStore`, and `DrizzleNetWorthStore` in `createConfiguredApplication`. Mount each router on `protectedRouter` before `createAggregateRouter`. Do not create database clients inside routers.

- [ ] **Step 5: Extend the database integration test and run non-database verification**

The integration test creates one uniquely named budget, income, Vault and contribution, asset, and liability; verifies fixed decimals and aggregate results; then deletes only created rows in `finally`. It must continue throwing the existing clear error when `TEST_DATABASE_URL` is absent.

Run: `npm.cmd test`

Expected: all unit, component, and API tests PASS.

Run: `npm.cmd run typecheck`

Expected: exit 0.

Run: `npm.cmd run build`

Expected: exit 0.

Run: `npm.cmd run db:check`

Expected: exit 0.

- [ ] **Step 6: Run integration tests when the configured disposable database is available**

Run: `npm.cmd run test:integration`

Expected with `TEST_DATABASE_URL`: PASS and cleanup succeeds. If it is absent, record the explicit configuration blocker without claiming live database acceptance.

- [ ] **Step 7: Commit the composed foundation**

```powershell
git add index.ts shared/contracts.ts server/records server/aggregates server/db/integration.test.ts
git commit -m "feat: compose budgeting foundation"
```
