# Personal Money Manager

Ledgerly is a private, single-user, mobile-first money logger. It keeps normal transactions, money lent, and money borrowed separate while presenting them together in history, dashboard summaries, and analytics.

The React client never talks to Neon directly. Express owns authentication, validation, timestamps, database access, and every authoritative financial aggregate.

## Stack

- React 19 + Vite
- Express 5 + TypeScript
- Drizzle ORM and Drizzle Kit
- Neon PostgreSQL through the Neon serverless driver
- Zod validation, Luxon timezone boundaries, decimal-string money contracts
- Vitest, Testing Library, Supertest, and Playwright

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

## Vercel

The root `index.ts` exports the Express application as one Vercel Function. During a Vercel build, Vite writes the React client to `public/` so Vercel can serve it from the CDN; API and health routes continue to run through Express. `vercel.json` supplies the SPA fallback without intercepting `/api`, `/healthz`, or compiled assets.

Configure these production environment variables in Vercel before deploying:

- `DATABASE_URL`
- `APP_PASSWORD`
- `SESSION_SECRET`
- `APP_TIMEZONE`
- `APP_ORIGIN`, set to the exact production origin such as `https://money.vercel.app`

Then apply migrations once and deploy:

```powershell
npm.cmd run db:migrate
vercel.cmd --prod
```

TypeScript is intentionally pinned to `6.0.3` because the current Vercel Express builder is incompatible with the changed compiler API in TypeScript 7.

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
| POST | `/api/transactions` | Create from `{ description, amount }` |
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

Create requests ignore unknown client fields and never accept an authoritative ID or timestamp. PostgreSQL generates UUIDs and `created_at`. Amounts must be positive plain decimal strings with no exponent, no more than 18 integer digits, and no more than two fractional digits. Responses return money with exactly two fractional digits.

Date filters use `YYYY-MM-DD` in `APP_TIMEZONE`; `to` is inclusive. API timestamps are ISO 8601 UTC strings. Analytics defaults are 30 days, 12 weeks, 12 months, or 5 years depending on the selected grouping.

## Security behavior

- The password is compared server-side with a timing-safe digest comparison.
- Random session tokens are signed in HTTP-only, `SameSite=Lax` cookies; only SHA-256 token digests are stored in PostgreSQL.
- Production cookies use `Secure`.
- Login is rate limited to five attempts per 15 minutes per IP.
- State-changing requests with a foreign `Origin` are rejected.
- Helmet security headers, a 16 KiB JSON limit, Zod request validation, parameterized Drizzle queries, and sanitized error responses are enabled.
- Passwords, cookies, database URLs, and financial request bodies are not logged.

## Verification

Unit/component/API checks do not require a database:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:check
```

Database integration tests require a separate disposable Neon branch or database whose schema has already been migrated:

```powershell
$env:TEST_DATABASE_URL='postgresql://...'
npm.cmd run test:integration
```

The integration suite creates uniquely named records and removes only those records. It never truncates shared tables.

Real browser acceptance also requires `DATABASE_URL` and migrated tables:

```powershell
npx.cmd playwright install chromium firefox
npm.cmd run test:e2e
```

Playwright covers mobile Chromium and desktop Firefox, real cookie authentication, automatic timestamps, all three create flows, unified history, cleanup, and wrong-password handling.
