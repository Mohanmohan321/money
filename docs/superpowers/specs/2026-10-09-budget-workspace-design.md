# Ledgerly Budget Workspace Design

**Date:** 2026-10-09
**Status:** Approved for implementation
**Route:** `/budget`

## Objective

Add a mobile-first budget calendar and expense workspace to Ledgerly without creating a second spending ledger. The feature reuses authenticated transactions as actual cash spending, existing decimal-safe conventions, Monday-based/local-time aggregation, Drizzle, Express, React, and Ledgerly's visual system.

## Architecture

- `transactions` remains the source of truth for actual expenses. Add nullable `expense_date`, `budget_category`, `notes`, `idempotency_key`, and `updated_at` fields. Legacy rows derive their local expense date from `created_at` in `APP_TIMEZONE`.
- New `budget_settings` stores the editable overall monthly limit, weekly food target, week start, category allocations, and allocation rules. Initial persisted values total ₹10,000.
- New `budget_date_overrides` stores manual planned totals for local dates. New `budget_day_records` distinguishes an explicitly recorded ₹0 day from missing data.
- `/api/budget` returns and mutates one coherent workspace model. Existing transaction routes remain backward compatible and gain update support.
- `/budget` is a new top-level route. It enhances the calendar pattern already used by `BreakdownCalendar`; it does not replace Analysis or Add.

## Budget Rules

The seeded editable categories are Bananas ₹300, Dates ₹300, Milk ₹300, Eggs ₹420, Oats ₹350, Peanut butter ₹350, Breakfast ₹480, Lunch ₹2,400, Dinner ₹2,400, Petrol ₹500, Snacks ₹1,200, and Miscellaneous ₹1,000. The included allocation is ₹10,000; groceries total ₹2,020 and meals total ₹5,280.

Planned daily values come from rules, never `monthly total / days`. Meal defaults allocate breakfast/lunch/dinner across configured weekdays. Groceries, petrol, snacks, and miscellaneous remain monthly allocations until assigned to a rule or explicit date. A date override replaces the automatic planned total. The independent ₹1,900 weekly food target is displayed with a discrepancy notice when it conflicts with monthly meal allocations; neither value changes the other.

All authoritative arithmetic uses decimal strings via `decimal.js`. Remaining is planned minus actual, variance is actual minus planned, and utilization is actual divided by planned. Positive spending against a zero plan returns `null` utilization and over-budget status.

## Record State and Dates

Each local day is `missing`, `recorded_zero`, or `recorded_with_expenses`. Future days are neutral. A positive transaction clears an explicit-zero marker. Deleting the last transaction returns the day to missing unless the user explicitly records zero.

Local dates stay as `YYYY-MM-DD` strings. The browser never creates a UTC timestamp to select a calendar date. Server queries use `expense_date` when present and otherwise derive the local date from `created_at` in `APP_TIMEZONE`, preserving all legacy history.

## UI

The page provides month navigation, Today, summary cards, a Monday-first calendar, and Calendar/Trends/Configuration tabs. Compact cells show date, planned amount, and actual/missing status. Selecting a date opens a bottom sheet on mobile and side panel on desktop with totals, create/edit/delete expense actions, notes, categories, and explicit zero recording.

Persisted mutations refetch the workspace atomically from the user's perspective so the day, calendar, weekly/monthly metrics, and charts update together. Trends use accessible HTML/CSS/SVG: planned vs actual by day, category breakdown, weekly comparison, cumulative trend, and utilization progress.

## Safety and Compatibility

All routes remain behind existing authentication and same-origin protection. The application remains a single private ledger; no second identity model is added. Existing Add, History, Dashboard, Analysis, and reporting continue to read `transactions`; budget-created transactions therefore appear consistently everywhere. Migration changes are additive and reversible by a later deliberate migration. No production migration or deployment runs automatically.

## Verification

Tests cover exact arithmetic, zero-plan handling, missing versus explicit zero, local dates and legacy rows, leap February, partial weeks, rules/overrides, idempotency, transaction editing/deletion, authenticated APIs, immediate UI refresh, mobile interaction, navigation, and regressions. Completion requires focused tests, full Vitest, typecheck, build, schema check, and Playwright where a disposable database is available.
