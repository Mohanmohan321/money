# Budgeting Intelligence Design

## Goal

Extend Ledgerly from a three-part money ledger into a persistent personal budgeting workspace. The upgrade adds monthly planning, income and savings tracking, category-aware spending, Vault goals, subscription detection, receipt capture, calendar analysis, annual reports, and net-worth tracking while preserving the existing transaction, lending, borrowing, authentication, and timezone behavior.

The app remains private and single-user. All authoritative financial data and calculations are stored or computed by the Express API and PostgreSQL. Browser state is only for in-progress forms and presentation.

## Product Structure

### Dashboard

The Dashboard begins with a Monthly Budget panel above the existing daily snapshot. It contains the selected month, salary, additional income, spending limit, savings target, and an edit action. Directly below it, four summary values show:

- Income: the month's configured salary plus additional income records.
- Spending: the month's normal transactions. Money lent, money borrowed, asset values, liability values, and Vault transfers are excluded.
- Savings: confirmed contributions to all Vaults, including the built-in General Savings Vault.
- Amount left: income minus spending minus savings.

The Budget Score is a zero-to-100 percentage calculated as `savings / income * 100`, clamped to that range. When income is zero, the score is zero. The card also compares actual spending with the spending limit. Values below zero are displayed as a shortfall rather than silently clamped.

The rest of the Dashboard is ordered for quick mobile scanning:

1. Net Worth status.
2. Recent transactions.
3. Vault Goals.
4. Subscription detector and monthly forecast.
5. Existing today and seven-day ledger summaries.

Recent transactions show the newest five income and spending records. Each row includes its semantic icon and label so meaning never depends on color alone. A See all action opens History.

### Analysis

The existing Analytics page becomes Analysis and uses three accessible tabs.

#### Monthly Budget

The selected month and total spending appear first. Previous and next month controls allow reviewing historical months. Below the total is a horizontally scrollable category strip showing icon, name, amount, and percentage of monthly spending.

The initial spending taxonomy is:

| Category | Icon | Color role | Example matches |
| --- | --- | --- | --- |
| Food | burger | orange | Swiggy, Zomato, restaurant, grocery |
| Travel | plane | blue | Uber, Ola, fuel, train, flight |
| Shopping | shopping bag | purple | Amazon, Flipkart, mall |
| Coffee | coffee cup | brown | cafe, coffee, Starbucks |
| Entertainment | film | pink | cinema, Netflix, Spotify, games |
| Health | heart/medical | green | pharmacy, hospital, doctor, medicine |
| Bills | receipt | teal | electricity, internet, phone, rent |
| Other | wallet | grey | unmatched descriptions |

Colors meet accessible contrast requirements, and text/icons remain present in charts, legends, transaction rows, and filters.

A Monday-to-Sunday tracker shows daily expenses for the week containing the selected date. Week navigation supports historical comparison. Daily totals use the same category colors, and selecting a day filters its transactions.

#### Budgeting Breakdown

A year control and January-to-December selector show each month's income, spending, budget usage, savings, and amount left. Selecting a month opens its calendar.

Each date cell shows separate green income and orange expense totals. Vault contributions and confirmed subscription payments use distinct icons. Selecting a date opens a detail panel containing that day's income, expenses, Vault contributions, and matched subscription transactions. On desktop, the monthly summary sits beside the calendar; on mobile, it appears above it.

#### Annual Report

The annual report contains:

- Annual income, spending, savings, amount left, and Budget Score.
- A monthly income-versus-spending bar or line graph.
- A monthly savings trend.
- A colored spending-category pie chart.
- An income-source pie chart.
- Highest-spending and best-saving months.
- A screen-readable legend and tabular equivalents for every chart.

The report is generated from persisted records and selected year boundaries in `APP_TIMEZONE`; it is not a browser-side estimate.

## Entry and Automation

### Income

Each monthly budget stores that month's salary, spending limit, and savings target. When a new month has no configuration, the API returns the most recent configuration as a suggested draft; nothing is persisted until the user saves it. This preserves salary history when values change.

Additional income uses a new record type with source, amount, optional category, and server-generated timestamp. Income records appear in History, recent activity, calendars, breakdowns, and reports. The Add page gains an Income mode.

### Spending Categories

Transactions gain a persisted category. The server suggests a category from a deterministic, case-insensitive merchant-keyword matcher when the client omits one. The Add form preselects the suggestion when possible and always allows manual override. User choices are authoritative and remain stable even if classification rules later change.

### Snap Receipt

Snap Receipt is available from the Dashboard and Add page. On supported phones it requests the rear camera through a file input with image capture; desktop users can upload an image.

OCR runs in the browser through a dynamically loaded worker, keeping the receipt image off the server. A deterministic parser extracts the candidate merchant and total from the recognized text, and the category classifier suggests a category. The user must review and confirm the fields before the app creates a normal transaction with the existing server-generated timestamp. OCR never changes financial totals directly. After a successful create response, Dashboard and Analysis queries refresh.

The receipt image and OCR text are discarded after confirmation or cancellation. If OCR confidence is insufficient, the form explains that the scan needs correction and leaves every field editable. Camera denial and unsupported formats fall back to manual entry.

### Vault Goals

Users can create multiple Vaults such as Trip, New Phone, or Emergency Fund. A Vault has a name, emoji, target amount, optional target date, status, and timestamps. Contributions are immutable money events with a positive amount and server-generated timestamp.

Each Vault card shows saved amount, target, percentage progress, target date, and Add money action. Contributions count as Savings and reduce Amount left for their month. The built-in General Savings Vault supports savings that are not tied to a named goal. Archived Vaults remain in reports; Vaults with contributions cannot be hard-deleted through the UI.

### Subscription Detector

The detector normalizes merchant descriptions and searches for at least two similar transactions. Weekly candidates have consecutive gaps of 5-9 days; monthly candidates have gaps of 25-35 days. Amounts match when they differ by no more than 10% from the candidate's median amount. It returns candidates with merchant, typical amount, cadence, estimated next date, monthly equivalent, annual cost, confidence, and supporting transaction IDs.

Users confirm or dismiss candidates. That decision is persisted. Confirmed subscriptions contribute to a separate forecast but do not increase actual Spending until a real transaction exists. When a new matching transaction is recorded, forecast dates update without duplicating the transaction.

## Net Worth

Net Worth is a dedicated Dashboard card and editable detail view.

Users can record owned assets such as cash, bank balances, investments, property, and vehicles, and owed liabilities such as loans, credit cards, and other debt. Each item has a name, type, current value or outstanding balance, optional note, and update timestamp.

The calculation is:

`Net Worth = total owned - total owed`

Money currently lent is included as an owned receivable, and money currently borrowed is included as an owed liability. They are shown separately from manually entered assets and liabilities to avoid invisible double counting. In this release, the existing delete behavior represents settlement for lent and borrowed records; deleted records no longer affect current Net Worth but remain outside historical net-worth snapshots. Manual assets and liabilities are never inferred from transaction descriptions.

The Net Worth card shows total owned, total owed, net worth, and positive/negative status. Savings moved into Vaults remain owned money and therefore do not reduce Net Worth.

## Data Model

PostgreSQL gains the following structures:

- `monthly_budgets`: unique month key, non-negative salary, spending limit, savings target, timestamps.
- `income`: source, category (`bonus`, `freelance`, `refund`, or `other`), amount, created-at timestamp.
- `transactions.category`: persisted category enum/string with `other` as migration default.
- `vaults`: name, emoji, target amount, optional target date, active/archived status, timestamps.
- `vault_contributions`: Vault foreign key, amount, created-at timestamp.
- `subscription_reviews`: normalized merchant key, status, cadence, representative amount, matching metadata, timestamps.
- `assets`: name, asset type, current value, optional note, timestamps.
- `liabilities`: name, liability type, outstanding balance, optional note, timestamps.

All event amounts and current values continue to use `NUMERIC(20, 2)`, positive checks, decimal-string API contracts, and database-generated identifiers. Monthly plan values allow zero but never negative values. Month values use validated `YYYY-MM`; report years use four digits. Records use `TIMESTAMPTZ` and are grouped using `APP_TIMEZONE`.

The application supports one configured display currency and does not perform currency conversion. Existing unlabeled values remain valid.

## API Boundaries

New authenticated endpoints are grouped by resource:

- `GET/PUT /api/budgets/:month`
- CRUD `/api/income`
- CRUD `/api/vaults` and `POST /api/vaults/:id/contributions`
- `GET /api/subscriptions/candidates` and review-state updates
- CRUD `/api/assets`
- CRUD `/api/liabilities`
- `GET /api/net-worth`
- `GET /api/analysis/monthly`
- `GET /api/analysis/breakdown`
- `GET /api/analysis/annual`

Existing create-transaction requests accept an optional category while remaining compatible with current clients. Dashboard and History response contracts are extended additively. Every request uses shared Zod validation and the existing success/error envelope.

The receipt image has no upload endpoint because OCR is local. Only the user-confirmed transaction fields reach the API.

## Error Handling and Consistency

Financial writes complete in database transactions when they update multiple tables. Failed writes do not optimistically change totals. After mutation, the client invalidates and reloads affected Dashboard, History, and Analysis data.

Missing monthly configuration produces an editable carry-forward suggestion, not fabricated stored data. Empty charts and calendars show explicit zero-data states. Division-by-zero calculations return zero scores and percentages. Negative Amount left is valid and styled as a warning. Invalid OCR, duplicate confirmations, deleted Vaults, and stale subscription candidates return stable error codes and recoverable UI messages.

## Delivery Sequence

Implementation is split into three dependency-ordered phases while remaining one feature set:

1. Financial foundation: migrations, shared contracts, income, budgets, categories, Vaults, assets/liabilities, calculations, and APIs.
2. Product surfaces: Dashboard composition, Analysis tabs, History integration, calendars, graphs, pie charts, and responsive/accessibility work.
3. Smart tools: local receipt OCR, transaction parser, subscription detection/review, refresh behavior, and end-to-end coverage.

Each phase must keep existing authentication, records, history, dashboard, and analytics tests green.

## Testing and Acceptance

Unit tests cover budget arithmetic, score bounds, month carry-forward behavior, category rules, OCR-text parsing, subscription recurrence detection, calendar grouping, annual aggregation, and net-worth composition using decimal values.

API tests cover authentication, validation, CRUD, additive compatibility, timezone boundaries, empty states, duplicate prevention, and sanitized errors. Database integration tests cover migrations, constraints, joins, aggregate precision, and transactional writes against the configured disposable database.

React tests cover:

- Dashboard ordering and all summary calculations returned by the server.
- Editing a monthly budget and adding income.
- Category icons, labels, colors, and manual override.
- Receipt review before transaction creation.
- Vault creation and contribution progress.
- Subscription confirmation/dismissal and forecast display.
- Asset/liability entry and Net Worth status.
- All three Analysis tabs, month/week/year navigation, calendar details, accessible chart legends, and empty/error states.

Playwright verifies the complete mobile path against the real API and test database: authenticate, configure a month, add income and expenses, scan from a deterministic receipt-image fixture, contribute to a Vault, review a subscription, enter an asset and liability, and confirm Dashboard/Analysis/Net Worth results. Desktop coverage verifies the calendar-side-panel layout. Type checking, unit/component/API tests, the production build, migration checks, and applicable integration/E2E suites are required before completion claims.

## Explicit Non-goals

- Multi-user accounts, bank sync, investment-price feeds, loan amortization, and currency conversion.
- Automatically saving an OCR result without confirmation.
- Counting subscription forecasts as actual spending.
- Inferring manual assets or liabilities from arbitrary spending descriptions.
- Replacing or weakening the current server-owned authentication and financial precision rules.
