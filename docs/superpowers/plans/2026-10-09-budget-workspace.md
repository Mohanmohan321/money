# Ledgerly Budget Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted, mobile-first `/budget` workspace that uses Ledgerly transactions as actual spending.

**Architecture:** Extend transactions additively for local expense dates and safe edits, persist planning configuration/overrides/zero markers in focused tables, aggregate them through one authenticated budget service, and render an accessible React workspace. Existing routes and transaction consumers remain compatible.

**Tech Stack:** React 19, TypeScript 6, Express 5, Drizzle/PostgreSQL, Zod, Luxon, Decimal.js, Vitest, Testing Library, Playwright.

## Global Constraints

- Reuse existing transactions, authentication, database, components, and deployment workflow.
- Store authoritative money as numeric decimal strings; never use floating point for totals.
- Preserve legacy transactions and derive their local expense dates from `created_at`.
- Keep missing days distinct from explicit ₹0 records.
- Do not deploy or run destructive production operations.

---

### Task 1: Domain contracts and calculations

**Files:** create `shared/budget-workspace.ts`, test `shared/budget-workspace.test.ts`, modify `shared/contracts.ts`.

- [ ] Write failing tests for seed totals, daily status/utilization, month/leap boundaries, partial Monday weeks, rules, overrides, aggregation, and projection.
- [ ] Run the focused test and confirm failures are caused by missing APIs.
- [ ] Implement exact decimal calculations and public Zod/contracts.
- [ ] Run focused tests to green.

### Task 2: Additive schema and transaction compatibility

**Files:** modify `server/db/schema.ts`, `server/records/store.ts`, `server/records/drizzle-record-store.ts`, `server/transactions/routes.ts`; add migration `drizzle/0003_budget_workspace.sql`; update schema and route tests.

- [ ] Write failing tests for dated/idempotent transaction creation and updates.
- [ ] Add transaction fields plus budget settings, overrides, and day-record tables.
- [ ] Implement backward-compatible create/list/get/delete and update/idempotency behavior.
- [ ] Generate/check migration metadata and run focused tests.

### Task 3: Authenticated budget API and persisted aggregation

**Files:** create `server/budget-workspace/store.ts`, `server/budget-workspace/drizzle-budget-workspace-store.ts`, `server/budget-workspace/routes.ts` and tests; modify `index.ts`.

- [ ] Write failing route/store tests for workspace reads, settings, override, explicit zero, create/edit/delete, local legacy dates, and auth.
- [ ] Implement persistence and aggregation using `expense_date` with timezone fallback.
- [ ] Mount `/api/budget` behind existing authentication.
- [ ] Run focused API/store tests to green.

### Task 4: Client API, route, calendar and editor

**Files:** modify `client/api.ts`, `client/App.tsx`, `client/components/AppShell.tsx`; create `client/pages/BudgetPage.tsx`, `client/components/budget/*`; update client tests and `client/styles.css`.

- [ ] Write failing tests for navigation, local date selection, month controls, missing/zero states, editor CRUD, and refresh-after-mutation.
- [ ] Add client API methods and `/budget` route.
- [ ] Implement compact Monday calendar and responsive bottom-sheet/side-panel editor.
- [ ] Run focused UI tests to green.

### Task 5: Configuration and accessible trends

**Files:** create `client/components/budget/BudgetConfiguration.tsx`, `client/components/budget/BudgetTrends.tsx` and tests; modify page/styles.

- [ ] Write failing tests for editable allocation total, weekly discrepancy, persisted configuration, empty states, and chart text equivalents.
- [ ] Implement category/rule/limit editing and accessible CSS/SVG trends.
- [ ] Run focused UI tests to green.

### Task 6: Regression and release readiness

**Files:** update `e2e/mobile-money-flow.spec.ts`, add `e2e/budget-workspace.spec.ts`, update `README.md`.

- [ ] Add responsive desktop/mobile happy-path coverage.
- [ ] Run focused tests, full Vitest, typecheck, build, and `db:check`.
- [ ] Run Playwright with a disposable database when configured; report exact boundary if unavailable.
- [ ] Review the diff for unrelated changes, secrets, migration safety, and acceptance coverage.
