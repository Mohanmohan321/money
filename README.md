# Personal Money Manager

Ledgerly is a private, single-user, mobile-first budgeting workspace. It keeps spending, income, Vault savings, money lent, and money borrowed semantically separate while presenting them together in the Dashboard, History, and Analysis views.

The React client never talks to Neon directly. Express owns authentication, validation, timestamps, database access, and every authoritative financial aggregate.

## Stack

- React 19 + Vite
- Express 5 + TypeScript
- Drizzle ORM and Drizzle Kit
- Neon PostgreSQL through the Neon serverless driver
- Zod validation, Luxon timezone boundaries, decimal-string money contracts
- Vitest, Testing Library, Supertest, and Playwright
- Tesseract.js browser worker for private receipt OCR

## Requirements

- Node.js 20.19 or newer
- A Neon PostgreSQL database
- npm 10 or newer

## Environment

Copy `.env.example` to `.env` and set:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
APP_PASSWORD=your-private-password
SESSION_SECRET=at-least-32-random-characters
NODE_ENV=development
APP_TIMEZONE=Asia/Kolkata
APP_ORIGIN=http://localhost:5173
PORT=3001
```

`DATABASE_URL` never reaches the browser. Development uses `2003` only when `APP_PASSWORD` is absent. Production requires explicit `APP_PASSWORD`, `SESSION_SECRET`, and `APP_ORIGIN` values and refuses to start without them.

Generate a session secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`APP_TIMEZONE` must be an IANA timezone. It controls today/week/month boundaries and interpretation of date-only API filters. PostgreSQL still stores generated timestamps as absolute UTC instants.

## Neon setup and migrations

1. Create a Neon project and copy its pooled or direct PostgreSQL connection string.
2. Put the connection string in `DATABASE_URL`.
3. Apply committed migrations:

```powershell
npm.cmd run db:migrate
```

For schema changes, edit `server/db/schema.ts`, then run:

```powershell
npm.cmd run db:generate
npm.cmd run db:check
npm.cmd run db:migrate
```

There is no SQLite, in-memory, or mock-data runtime fallback. Missing Neon configuration produces a clear startup error.

Migration `0001_budgeting_foundation.sql` adds monthly budgets, income, spending categories, Vaults and contributions, assets, and liabilities. It backfills existing transactions to the `other` category before making the category required. Migration `0002_subscriptions.sql` additively creates persisted subscription reviews and does not alter financial records. Migration `0003_loving_namor.sql` adds only `budget_calendar_*` tables and seeds the editable ₹10,000 allocation. Apply all committed migrations before using their related screens.

## Run locally

Install and start both processes:

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to Express on port 3001, so browser requests remain same-origin from the application's perspective.

## Production

```powershell
$env:NODE_ENV='production'
npm.cmd run build
npm.cmd start
```

Express serves both `dist/client` and `/api` from `PORT`. Set `APP_ORIGIN` to the exact public origin, for example `https://money.example.com`.

## Replit

Import the repository, then add these Secrets in Replit:

- `DATABASE_URL`
- `APP_PASSWORD`
- `SESSION_SECRET`
- `APP_TIMEZONE`
- `APP_ORIGIN`
- `NODE_ENV=production` for deployment

Run `npm run db:migrate` once in the Shell. The included `.replit` uses `npm run dev` in the workspace and `npm run build` / `npm start` for deployment.

## Render backend and Vercel frontend

Production is split without exposing Neon to the browser:

- Render runs the Express API at `https://ledgerly-money-api.onrender.com`.
- Vercel serves the React client at `https://money-three-rose.vercel.app`.
- Vercel forwards `/api/*` and `/healthz` to Render, keeping browser requests and the HTTP-only session cookie on the frontend origin.

The committed `render.yaml` defines the free Singapore-region Node web service, build/start commands, health check, and secret variable names. Configure `DATABASE_URL`, `APP_PASSWORD`, and `SESSION_SECRET` as Render secrets; never add their values to the blueprint.

The committed `vercel.json` builds only the Vite client and contains the Render proxy rewrites plus the SPA fallback. No database or authentication secret is required in Vercel.

## API contract

Every response uses one envelope:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": { "message": "Readable message", "code": "STABLE_CODE" }
}
```

All `/api` routes except authentication require the signed `money_session` HTTP-only cookie. Operational liveness is exposed separately at `/healthz`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Public operational liveness response |
| POST | `/api/auth/login` | Authenticate with `{ "password": "..." }` |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/auth/me` | Return `{ authenticated }` |
| POST | `/api/transactions` | Create from `{ description, amount, category? }` |
| GET | `/api/transactions?from=&to=` | List transactions newest-first |
| GET | `/api/transactions/:id` | Read one transaction |
| DELETE | `/api/transactions/:id` | Delete one transaction |
| POST | `/api/lent` | Create from `{ personName, amount }` |
| GET | `/api/lent?from=&to=` | List lending records |
| GET | `/api/lent/:id` | Read one lending record |
| DELETE | `/api/lent/:id` | Delete one lending record |
| POST | `/api/borrowed` | Create from `{ personName, amount }` |
| GET | `/api/borrowed?from=&to=` | List borrowing records |
| GET | `/api/borrowed/:id` | Read one borrowing record |
| DELETE | `/api/borrowed/:id` | Delete one borrowing record |
| GET | `/api/history?type=&from=&to=&limit=&offset=` | Unified chronological feed |
| GET | `/api/dashboard` | Today, current week, and current month aggregates |
| GET | `/api/analytics?period=day\|week\|month\|year&from=&to=` | Movement, statistics, and person aggregates |
| GET, PUT | `/api/budgets/:month` | Read or replace a `YYYY-MM` budget plan |
| POST, GET | `/api/income` | Create or list additional income |
| GET, PUT, DELETE | `/api/income/:id` | Read, replace, or delete one income record |
| POST, GET | `/api/vaults` | Create or list Vault goals |
| GET, PUT, DELETE | `/api/vaults/:id` | Read, update, or delete an eligible Vault |
| POST | `/api/vaults/:id/contributions` | Add an immutable savings contribution |
| POST | `/api/vaults/:id/archive` | Archive a user-created Vault |
| POST, GET | `/api/assets` | Create or list manual assets |
| PUT, DELETE | `/api/assets/:id` | Update or delete a manual asset |
| POST, GET | `/api/liabilities` | Create or list manual liabilities |
| PUT, DELETE | `/api/liabilities/:id` | Update or delete a manual liability |
| GET | `/api/net-worth` | Server-computed owned, owed, and net-worth totals |
| GET | `/api/subscriptions/candidates` | Detect pending and confirmed recurring-payment candidates and return the separate confirmed forecast |
| PUT | `/api/subscriptions/:merchantKey/review` | Persist `{ "status": "confirmed" | "dismissed" }` for a current candidate |
| GET | `/api/analysis/monthly?month=&week=` | Monthly summary, categories, and Monday-Sunday activity |
| GET | `/api/analysis/breakdown?year=&month=` | 12-month rail, calendar totals, and day activity |
| GET | `/api/analysis/annual?year=` | Annual metrics, chart series, shares, and extrema |
| GET, PUT | `/api/budget-calendar/settings` | Read or update week start and weekly food target |
| GET, POST | `/api/budget-calendar/categories` | List or create isolated Budget Calendar categories |
| PUT, DELETE | `/api/budget-calendar/categories/:id` | Update or archive an isolated category |
| GET, PUT | `/api/budget-calendar/months/:month` | Read or replace a stable monthly allocation snapshot |
| GET, POST | `/api/budget-calendar/rules` | List or create recurring daily-planning rules |
| PUT, DELETE | `/api/budget-calendar/rules/:id` | Update or delete a planning rule |
| PUT, DELETE | `/api/budget-calendar/overrides/:date` | Save or remove a local-date plan override |
| GET | `/api/budget-calendar/days/:date` | Read a planned day, record state, and its expenses |
| PUT | `/api/budget-calendar/days/:date/record-state` | Record explicit zero spending or restore missing state |
| POST | `/api/budget-calendar/expenses` | Create an idempotent isolated calendar expense |
| PUT, DELETE | `/api/budget-calendar/expenses/:id` | Edit or delete an isolated calendar expense |
| GET | `/api/budget-calendar/months/:month/calendar` | Monthly calendar cells and persisted totals |
| GET | `/api/budget-calendar/months/:month/summary` | Weekly/monthly metrics and projection |
| GET | `/api/budget-calendar/months/:month/trends` | Daily, category, weekly, and cumulative chart data |

Create requests ignore unknown client fields and never accept an authoritative ID or timestamp. PostgreSQL generates UUIDs and `created_at`. Amounts must be positive plain decimal strings with no exponent, no more than 18 integer digits, and no more than two fractional digits. Responses return money with exactly two fractional digits.

Date filters use `YYYY-MM-DD` in `APP_TIMEZONE`; `to` is inclusive. API timestamps are ISO 8601 UTC strings. Analytics defaults are 30 days, 12 weeks, 12 months, or 5 years depending on the selected grouping.

## Budgeting semantics

- Income is the saved monthly salary plus persisted additional-income records.
- Spending includes categorized transactions only; lending, borrowing, Vault transfers, assets, and liabilities are excluded.
- Savings is the sum of confirmed Vault contributions. The canonical General Savings Vault is included and cannot be renamed, archived, or deleted.
- Amount left is `income - spending - savings`. Negative values remain visible as shortfalls.
- Budget Score is the server-provided `savings / income * 100`, clamped from 0 to 100; zero income produces zero.
- Net Worth is `total owned - total owed`. Owned includes manual assets and outstanding lending; owed includes manual liabilities and outstanding borrowing. Vault savings remain owned money.
- Spending categories are Food, Travel, Shopping, Coffee, Entertainment, Health, Bills, and Other. The server's deterministic suggestion is used only when the user does not choose a category; persisted user choices stay authoritative.
- Snap Receipt accepts non-empty JPEG, PNG, and WebP images up to 10 MiB. OCR is dynamically loaded and runs in a browser worker; the image and recognized text are never uploaded or persisted. The first scan downloads the English model from jsDelivr and subsequent scans can reuse the browser cache. Merchant, amount, and category remain editable, and no spending record exists until **Confirm spending** succeeds. There is no receipt server route and no OCR secret.
- Subscription detection requires at least two normalized merchant matches. Weekly gaps are 5-9 days, monthly gaps are 25-35 days, and every amount must remain within 10% of the Decimal median. Two occurrences have medium confidence; three or more have high confidence. Confirmed monthly and annual projections are forecasts only: they never change actual Spending or add future calendar dates. The Breakdown calendar marks only persisted transactions whose normalized merchant currently has a confirmed review.

## Budget Calendar semantics

- **Budget Calendar** is a separate primary tab and data pipeline. Its expenses never create or alter `transactions`, History, Dashboard spending, or the existing Analysis reports.
- Monthly category allocations are editable snapshots. The initial categories total ₹10,000: groceries ₹2,020, meals ₹5,280, petrol ₹500, snacks ₹1,200, and miscellaneous ₹1,000.
- Allocations and cash spending are different. Recurring rules plus date overrides produce daily planned amounts; only saved Budget Calendar expenses contribute to actual spending.
- Groceries are recorded as grocery purchases and are not duplicated as meal spending. The independent ₹1,900 weekly food target is a planning reference; the UI visibly reports its mismatch with the ₹5,280 monthly meal allocation.
- A day is either missing, explicitly recorded as ₹0, or backed by one or more expenses. Missing dates are never treated as confirmed zero-spending days.
- Money is persisted as PostgreSQL numeric values and transported as exact two-decimal strings. Display calculations use Decimal arithmetic; local dates remain `YYYY-MM-DD` strings without UTC conversion.
- Recurring rules support daily, weekly, monthly, and selected-weekday schedules. Date-specific overrides replace the calculated plan. Months and leap years use their real calendar length.
- The Trends tab uses persisted calendar data for planned-vs-actual, category share, weekly comparison, cumulative pace, utilization, and an explicitly labeled recorded-day projection.

The `/analytics` bookmark remains valid, while the visible navigation label is **Analysis**. Its Monthly Budget, Budgeting Breakdown, and Annual Report tabs render only API-provided financial totals. Browser number conversion is limited to chart coordinates and progress geometry; displayed amounts come from decimal-string contracts.

## Security behavior

- The password is compared server-side with a timing-safe digest comparison.
- Random session tokens are signed in HTTP-only, `SameSite=Lax` cookies; only SHA-256 token digests are stored in PostgreSQL.
- Production cookies use `Secure`.
- Login is rate limited to five attempts per 15 minutes per IP.
- State-changing requests with a foreign `Origin` are rejected.
- Helmet security headers, a 16 KiB JSON limit, Zod request validation, parameterized Drizzle queries, and sanitized error responses are enabled. The receipt worker CSP is narrowly limited to self/blob workers, WebAssembly evaluation, and jsDelivr scripts/model connections; inline scripts and wildcard origins are not enabled.
- Passwords, cookies, database URLs, and financial request bodies are not logged.

## Verification

Unit/component/API checks do not require a database:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:check
```

Database integration tests require a separate disposable Neon branch or database whose schema has already been migrated, plus an explicit disposable-data guard:

```powershell
$env:TEST_DATABASE_URL='postgresql://...'
$env:TEST_DATABASE_DISPOSABLE='true'
npm.cmd run test:integration
```

The integration suite creates uniquely named records and removes only those records. It never truncates shared tables.

Real browser acceptance also requires `DATABASE_URL` and migrated tables:

```powershell
npx.cmd playwright install chromium firefox
npm.cmd run test:e2e
```

Playwright is configured for mobile Chromium and desktop Firefox. With a migrated disposable runtime database, it covers real cookie authentication, automatic timestamps, all original create flows, runtime-generated receipt OCR, subscription review and forecast separation, unified history and targeted cleanup, mobile Dashboard ordering/no-overflow/tab access, and desktop Breakdown/report-table layout. Set `TEST_DATABASE_DISPOSABLE=true` for the automation cases that directly backdate or remove explicitly tracked test rows. The helper refuses production, deletes contribution/review children before parents, accepts explicit IDs/keys only, and never truncates a table. These live checks are separate from the database-free component suite.
