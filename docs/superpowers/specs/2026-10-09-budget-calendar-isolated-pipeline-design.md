# Isolated Budget Calendar Pipeline Design

**Date:** 2026-10-09  
**Status:** Approved direction; implementation pending  
**Application:** Ledgerly

## Objective

Add a mobile-first Budget Calendar as a new top-level Ledgerly tab. The feature maintains its own planned-budget and actual-expense data pipeline. It reuses Ledgerly's authentication, database connection, server conventions, visual language, and deployment workflow, but it does not read from or write to the existing transaction, income, History, Add, Analysis, subscription, Vault, lending, borrowing, or aggregate pipelines.

The feature supports editable monthly allocations, scheduled planned amounts, date overrides, multiple daily expense entries, weekly and monthly summaries, and persisted visual reporting.

## Scope and Isolation Invariants

The new surface is available at `/budget-calendar` and is labeled **Budget Calendar** in desktop and mobile navigation.

The following invariants are mandatory:

1. Budget Calendar expenses are stored only in Budget Calendar tables.
2. Existing `transactions` and `monthly_budgets` records are neither imported nor modified.
3. Budget Calendar expenses do not appear in Add, History, Dashboard, Analysis, subscription detection, or existing financial aggregates.
4. Existing transactions do not appear in Budget Calendar totals or charts.
5. Existing routes and response contracts remain backward compatible.
6. Shared infrastructure may be reused, but shared financial data stores may not be reused.
7. The initial ₹10,000 configuration is seeded as editable persisted data, not hardcoded into calculations or UI output.

These boundaries intentionally permit the two pipelines to show different totals because they represent independent workflows.

## Existing Architecture Reused

Ledgerly is a React 19 and Vite client backed by Express 5, Drizzle ORM, Neon PostgreSQL, Zod validation, Luxon timezone handling, decimal-string money contracts, and cookie-based single-user authentication.

The feature will reuse:

- `AppShell` navigation and responsive layout conventions.
- Existing authentication middleware and same-origin protection.
- The existing Drizzle database client and migration workflow.
- Server error handling, request identifiers, and response envelopes.
- Local-date configuration from `APP_TIMEZONE`.
- Decimal-safe monetary conventions and money formatting.
- Existing typography, colors, spacing, form, card, loading, error, and empty-state patterns.

The application currently has one authenticated private ledger rather than multiple user accounts. Budget Calendar data therefore follows the same authenticated single-user boundary; no separate owner or authentication model will be introduced.

## Navigation and Page Structure

The primary navigation gains a fifth item:

- Dashboard
- Add
- Budget Calendar
- History
- Analysis

The page contains four internal views:

1. **Calendar** — monthly calendar, summary cards, legend, month navigation, and selected-day editor.
2. **Trends** — planned-versus-actual, weekly comparison, cumulative monthly trend, category distribution, and utilization.
3. **Categories** — editable monthly category allocations and inclusion settings.
4. **Rules** — weekly food target, week start, recurring schedules, and date overrides.

The Calendar view is the default. Internal views use accessible tabs with keyboard arrow navigation. On mobile, selecting a date opens a bottom sheet or full-screen dialog. On larger screens it opens a side panel or modal without changing the underlying data flow.

## Data Model

All new tables use a `budget_calendar_` prefix to make pipeline ownership explicit.

### `budget_calendar_settings`

One settings row for the private ledger:

- `id` — stable singleton identifier.
- `week_start` — initially Monday; constrained to a valid weekday value.
- `weekly_food_target` — non-negative `numeric(20,2)`, initially ₹1,900.
- `created_at`, `updated_at`.

### `budget_calendar_categories`

- `id` — UUID primary key.
- `name` — unique case-insensitive display name.
- `group` — `grocery`, `meal`, `petrol`, `snacks`, `miscellaneous`, or `other`.
- `monthly_amount` — non-negative `numeric(20,2)`.
- `included_in_overall_budget` — boolean.
- `active` — boolean used instead of destructive category deletion when referenced.
- `sort_order` — stable display order.
- `created_at`, `updated_at`.

Initial categories and monthly amounts:

| Category | Group | Amount |
| --- | --- | ---: |
| Bananas | Grocery | ₹300 |
| Dates | Grocery | ₹300 |
| Milk | Grocery | ₹300 |
| Eggs | Grocery | ₹420 |
| Oats | Grocery | ₹350 |
| Peanut butter | Grocery | ₹350 |
| Breakfast | Meal | ₹480 |
| Lunch | Meal | ₹2,400 |
| Dinner | Meal | ₹2,400 |
| Petrol | Petrol | ₹500 |
| Snacks | Snacks | ₹1,200 |
| Miscellaneous | Miscellaneous | ₹1,000 |

The included allocation total is ₹10,000. Grocery subtotal is ₹2,020 and meal subtotal is ₹5,280. Grocery estimates and the weekly food target are planning references, not extra actual expenses.

### `budget_calendar_months`

- `month` — `YYYY-MM` primary key.
- `overall_limit` — non-negative `numeric(20,2)`.
- `configuration_snapshot` — JSONB snapshot of category amounts and inclusion flags used for stable historical reporting.
- `created_at`, `updated_at`.

When a month is first opened, its configuration is created from the current editable category settings. Later global category edits do not silently rewrite historical months. A user may explicitly update the selected month's configuration.

### `budget_calendar_rules`

- `id` — UUID primary key.
- `category_id` — category reference.
- `frequency` — `daily`, `weekly`, `monthly`, or `specific_days`.
- `weekdays` — JSONB array for scheduled weekdays when applicable.
- `day_of_month` — optional integer for monthly allocation.
- `amount` — non-negative `numeric(20,2)`.
- `active_from`, `active_to` — optional local calendar dates.
- `created_at`, `updated_at`.

Rules determine planned dates. They never create actual expenses.

### `budget_calendar_overrides`

- `date` — local calendar date primary key.
- `planned_amount` — non-negative `numeric(20,2)`.
- `note` — optional text.
- `created_at`, `updated_at`.

An override replaces the automatically calculated total planned amount for its date and is visibly labeled as manual.

### `budget_calendar_expenses`

- `id` — UUID primary key.
- `expense_date` — required local calendar date.
- `category_id` — category reference.
- `amount` — positive `numeric(20,2)`.
- `description` — optional bounded text.
- `notes` — optional bounded text.
- `idempotency_key` — unique client-generated UUID.
- `created_at`, `updated_at`.

Multiple entries may share a date. The actual total for a date is their sum.

### `budget_calendar_day_records`

- `date` — local calendar date primary key.
- `recorded_zero` — boolean.
- `created_at`, `updated_at`.

This table distinguishes an explicitly confirmed ₹0 day from a day with no recorded information. Saving a positive expense clears a redundant zero marker. Deleting the final expense does not automatically claim that the day was zero; the user must explicitly mark it.

## Planning and Calculation Rules

All money calculations use decimal strings or exact minor-unit arithmetic. Floating-point arithmetic is prohibited for persisted money and authoritative totals.

For each calendar date:

1. Evaluate active category rules in the application timezone.
2. Sum the planned amounts assigned to that date.
3. If a date override exists, replace the calculated total with the override.
4. Sum Budget Calendar expense entries for the actual total.
5. Determine record state as `missing`, `recorded_zero`, or `recorded_with_expenses`.

Derived values:

- Remaining = planned − actual.
- Variance = actual − planned.
- Utilization = actual ÷ planned × 100.
- A zero planned amount with zero actual spending has 0% utilization.
- A zero planned amount with positive spending is over budget and has no finite utilization percentage; the API returns `null` for percentage plus an over-budget status.
- Status is `missing`, `under`, `on`, `over`, or `future`.

Future dates display planned amounts but do not count as missing actual records. Recorded zero is distinct from missing and counts as a recorded under-budget day when the planned amount is positive.

Food rules allocate breakfast, lunch, and dinner according to their configured schedules. Grocery categories remain separate. Petrol, snacks, and miscellaneous remain monthly allocations until assigned by a rule or date override. No category is distributed by blindly dividing ₹10,000 by the number of days.

The weekly food target is an optional reference. If the target multiplied across the selected month conflicts with the meal allocation snapshot, the UI displays a discrepancy notice. Neither value silently modifies the other.

Weeks default to Monday through Sunday. A weekly view states its exact date range and may span two calendar months. Monthly totals include only dates inside the selected month; week cards identify out-of-month portions rather than silently folding them into monthly totals.

Projection uses recorded days only:

`projected month end = average actual spending across recorded elapsed days × elapsed days in month`

The result is labeled as an estimate and is omitted when no elapsed day has been recorded.

## API Boundary

All endpoints live under `/api/budget-calendar` and are protected by Ledgerly's existing authentication middleware.

Planned endpoints:

- `GET /api/budget-calendar/months/:month`
- `PUT /api/budget-calendar/months/:month`
- `GET /api/budget-calendar/months/:month/calendar`
- `GET /api/budget-calendar/months/:month/summary`
- `GET /api/budget-calendar/months/:month/trends`
- `GET /api/budget-calendar/categories`
- `POST /api/budget-calendar/categories`
- `PUT /api/budget-calendar/categories/:id`
- `DELETE /api/budget-calendar/categories/:id` (archives referenced categories)
- `GET /api/budget-calendar/rules`
- `POST /api/budget-calendar/rules`
- `PUT /api/budget-calendar/rules/:id`
- `DELETE /api/budget-calendar/rules/:id`
- `PUT /api/budget-calendar/overrides/:date`
- `DELETE /api/budget-calendar/overrides/:date`
- `GET /api/budget-calendar/days/:date`
- `POST /api/budget-calendar/expenses`
- `PUT /api/budget-calendar/expenses/:id`
- `DELETE /api/budget-calendar/expenses/:id`
- `PUT /api/budget-calendar/days/:date/record-state`

Input validation rejects invalid calendar dates, invalid month strings, negative allocations, non-positive expense amounts, invalid category references, excessive text lengths, and malformed idempotency keys. Repeating an expense creation with the same idempotency key returns the original expense instead of creating a duplicate.

## Client Behavior

### Calendar

The calendar uses a Monday-first grid with previous month, next month, and Today controls. Local dates are represented as `YYYY-MM-DD` strings and are not round-tripped through UTC timestamps for selection or persistence.

Compact mobile cells show:

- Date number.
- Planned amount.
- Compact actual/status indicator.
- Green within budget, red over budget, gray missing, and neutral future styling.

The selected date is visually highlighted and exposed with `aria-pressed`. Accessible text communicates planned amount, actual amount, record state, and budget status without relying on color.

### Day Editor

The editor shows the selected local date, computed or overridden plan, actual total, remaining amount, variance, utilization, and status. It lists every saved expense and supports create, edit, and delete operations.

Expense fields are category, amount, optional description, and optional notes. Amount inputs use a mobile numeric keypad. The Save action is sticky or persistently reachable on small screens. Submissions are disabled while pending and use a stable idempotency key for retry safety.

An explicit **Record ₹0 spent** action creates the recorded-zero state. Adding a positive expense removes that state. Success, validation, retry, loading, and deletion-confirmation states are announced accessibly.

### Configuration

The category editor shows the live included-allocation total before saving. Categories can be added, edited, included or excluded from the overall limit, reordered, and archived. Referenced categories retain historical labels.

The rules editor supports frequency, amount, weekdays, optional active range, weekly food target, and date overrides. The page previews affected planned dates before a rule is saved.

### Dashboard and Charts

Summary cards show:

- Monthly budget.
- Actual spending.
- Remaining or exceeded amount.
- Utilization.
- Current/selected week plan and actual.
- Daily recorded average.
- Under-budget and over-budget day counts.

Charts use accessible HTML and SVG without adding a chart dependency:

- Daily planned versus actual bars or lines.
- Category distribution with amounts, percentages, and a data table.
- Weekly planned versus actual comparison.
- Cumulative monthly planned versus actual trend.
- Weekly and monthly utilization progress bars.

Charts include text equivalents or tables, remain readable at mobile widths, and use persisted Budget Calendar data only. Missing days are visually distinct from actual zero values.

## Error Handling and Consistency

- API responses use Ledgerly's existing success/failure envelope.
- Writes validate category/rule existence and use database transactions where a write affects more than one table.
- Idempotency prevents accidental duplicate expense creation during retries.
- Optimistic UI is limited to reversible selection state. Persisted totals update from confirmed server responses.
- After a successful mutation, the active day, calendar, weekly summary, monthly summary, and chart data are refreshed together.
- Failures retain the user's draft and display a recoverable error.
- No destructive production database operation is required. The migration only creates new tables and indexes.

## Migration and Initial Data

One reversible Drizzle migration creates the prefixed tables, constraints, foreign keys, and indexes. Initial categories and the singleton settings row are inserted idempotently using conflict-safe statements.

The migration does not alter or backfill existing financial tables. Removing the feature can be performed by a deliberate later migration without affecting the original transaction pipeline; automatic rollback is not run against production.

## Testing Strategy

Implementation follows red-green-refactor testing.

### Calculation tests

- Under, on, and over-budget calculations.
- Negative remaining values.
- Safe zero planned-budget handling.
- Missing versus explicitly recorded zero.
- Multiple expenses on one day.
- Category totals and percentages.
- Date overrides.
- Weekly targets versus monthly allocation discrepancy.
- Partial weeks and cross-month weeks.
- 28-, 29-, 30-, and 31-day months.
- Leap and non-leap February.
- Projection based only on recorded elapsed days.

### API and storage tests

- Category, rule, month, override, expense, and record-state CRUD.
- Persistence and aggregation from Budget Calendar tables only.
- Authentication on every route.
- Invalid input and missing resources.
- Edit and delete behavior.
- Idempotent repeated expense creation.
- Referenced category archival.
- Proof that existing transaction stores and endpoints are unaffected.

### Client tests

- New navigation route.
- Month navigation and Today.
- Date selection and local-date stability.
- Bottom-sheet/dialog behavior.
- Add, edit, delete, and explicit-zero flows.
- Immediate refreshed summaries after confirmed saves.
- Configuration totals and discrepancy warning.
- Chart and empty-state rendering.
- Keyboard tab and calendar access.
- Non-color status labels.
- No horizontal overflow at target mobile widths.

### Verification tiers

1. Focused calculation, server route/store, and client component tests.
2. Full Vitest suite and TypeScript typecheck.
3. Production client/server build and Drizzle schema check.
4. Playwright mobile and desktop flows against a disposable database where available.
5. Deployment readiness report. Deployment occurs only through the established authorized workflow and is reported separately from local verification.

## Acceptance Criteria

The feature is complete when:

- Budget Calendar is a distinct authenticated top-level tab.
- Its data resides only in the prefixed Budget Calendar tables.
- The ₹10,000 initial allocation is seeded, editable, and totals correctly.
- Planned values come from rules or overrides rather than flat month division.
- Multiple daily expenses, edits, deletions, and explicit zero days persist.
- Calendar statuses and summaries correctly distinguish missing, zero, under, on, over, and future dates.
- Weekly/monthly totals and charts use only Budget Calendar data.
- Local dates do not shift through timezone conversion.
- Mobile and desktop interaction patterns are accessible and usable.
- Existing Ledgerly financial pipelines and tests remain unchanged in behavior.
- Verification evidence and any deployment steps are reported without claiming deployment unless it is actually completed and live-checked.

## Out of Scope

- Synchronizing Budget Calendar expenses with existing transactions.
- Importing or exporting existing Ledgerly History records.
- Replacing Ledgerly authentication.
- Adding multi-user accounts or ownership records.
- Creating a second database or framework.
- Automatic production deployment without explicit authorization through the existing workflow.
