# Budgeting Foundation Final Fix Report

Date: 2026-09-03

Branch: `feature/budgeting-intelligence`

Reviewed starting point: `f3436d248e85700845345b46ebcd4a7fa49ebefa`

## Outcome

All six validated Important findings and the History-page Minor finding from `final-review-package.md` were repaired in the private, authenticated, single-user foundation scope. No unrelated feature surface was changed.

## Repairs

1. **Exact budget arithmetic**
   - `calculateBudgetSummary` now uses a function-scoped Decimal constructor whose precision is derived from the widest input plus result-growth digits.
   - Exact maximum-component income (`1999999999999999999.98`) and Amount left (`999999999999999999.98`) are covered, along with maximum spending, zero income, both score clamps, and negative Amount-left/spending-limit shortfalls.

2. **Vault aggregate precision**
   - The production aggregate returns `COALESCE(SUM(...), 0)::text`; it no longer narrows a valid multi-row sum back into `NUMERIC(20,2)`.
   - Vault progress uses scoped, operand-sized Decimal precision.
   - The SQL-shape regression compiles the selected Drizzle expression, models PostgreSQL SQLSTATE `22003` for the former narrowing cast, and asserts the exact two-maximum-contribution `.99` result and progress.

3. **Canonical General Savings invariants**
   - Vault responses expose `isGeneral` instead of requiring clients to know a private UUID.
   - General Savings cannot be renamed, archived, or deleted. Routes return the stable sanitized conflict `GENERAL_VAULT_PROTECTED` with status 409.
   - It remains able to receive contributions and can update its target amount/date only while retaining canonical name and emoji.
   - Lazy concurrent creation uses conflict repair for name, emoji, and active status only, preserving financial target/date settings and tolerating a separate user Vault with the same display name.

4. **Income and Vault updates**
   - Added shared `updateIncomeSchema`/`UpdateIncomeInput` and `updateVaultSchema`/`UpdateVaultInput` contracts.
   - Added update methods to both store interfaces, test memory stores, and production Drizzle stores.
   - Added authenticated `PUT /api/income/:id` and `PUT /api/vaults/:id` routes with normalization, validation, stable not-found responses, and sanitized unexpected errors.
   - Income supports correction of source, category, amount, and event timestamp. Vaults support name, emoji, target, and optional date updates while protecting canonical semantics.

5. **Deterministic category classification**
   - Added every keyword example documented in the design table: grocery, fuel, mall, games, and all previously documented examples.
   - Replaced locale-sensitive casing with `toLowerCase()`.
   - Keyword matching now uses token boundaries, with regressions for unrelated substrings such as `parent`, `small`, `billionaire`, and `border`.

6. **Disposable database acceptance capability**
   - The optional suite now requires both `TEST_DATABASE_URL` and the explicit acknowledgement `TEST_DATABASE_DISPOSABLE=true` before applying migrations.
   - It applies the production migrations, applies them separately to an isolated legacy schema to verify the transaction-category backfill and constraints, and exercises carry-forward, Income/Vault updates, production history, canonical repair/protection, high-precision Vault/Net Worth aggregates, and real concurrent Vault operations.
   - Every case uses unique data. Cleanup runs in dependency order, continues after individual cleanup failures, and drops only the test-created isolated schema/rows.
   - No database was provisioned or mutated during this run because `TEST_DATABASE_URL` was absent.

7. **History income component coverage**
   - Added a real `HistoryPage` component test for the Income label/icon/category, `type=income` request, confirmation, and `DELETE /api/income/:id` behavior.
   - History metadata now renders the category for both transaction and Income entries.

The corrected design and foundation plan now document the concrete update endpoints, public canonical marker/invariants, aggregate precision, and disposable-test gate.

## TDD Evidence

Tests were added before each corresponding implementation behavior.

| Cycle | RED evidence | GREEN evidence |
|---|---|---|
| Budget arithmetic and classifier | `npm.cmd test -- shared/budgeting.test.ts` -> 10 failed, 28 passed: missing documented keywords/boundaries and rounded maximum income/Amount left | Same command -> 38/38 passed |
| Shared update contracts | Focused contracts run -> 1 failure because `updateIncomeSchema` was absent | Budgeting + contracts -> 2 files, 56 tests passed |
| Income update API/store | `npm.cmd test -- server/budgets/routes.test.ts` -> 4 failed, 12 passed: missing PUT route and Drizzle method | Budget routes + contracts -> 2 files, 34 tests passed |
| Vault update/canonical/aggregate behavior | Vault/contracts focused run -> 9 failed, 25 passed: missing update routes, unprotected canonical operations, narrowing aggregate, and default Decimal rounding | Vault/contracts focused run -> 2 files, 52 tests passed; final Vault-only run -> 35/35 passed |
| History income rendering | `npm.cmd test -- client/pages/HistoryPage.test.tsx` -> 1 failed because the Income category was absent | Same command -> 1/1 passed |

Final focused regression command:

```text
npm.cmd test -- shared/budgeting.test.ts shared/contracts.test.ts server/budgets/routes.test.ts server/vaults/routes.test.ts client/pages/HistoryPage.test.tsx server/db/schema.test.ts
```

Result: exit 0; 6 files and 110 tests passed.

## Final Verification

| Command | Result |
|---|---|
| Baseline `npm.cmd test` at starting SHA | exit 0; 15 files, 129 tests passed |
| Final focused command above | exit 0; 6 files, 110 tests passed |
| `npm.cmd test` | exit 0; 16 files, 173 tests passed |
| `npm.cmd run typecheck` | exit 0; `tsc --noEmit` |
| `npm.cmd run db:check` | exit 0; Drizzle Kit: `Everything's fine` |
| `git diff --check` | exit 0; no whitespace errors |
| `npm.cmd run test:integration` | exit 1 by the intentional safety guard; 10 tests skipped because `TEST_DATABASE_URL` is absent |

### Build discrepancy reconciled

The first sandboxed `npm.cmd run build` completed the Vite client build (1,839 modules) but the server bundler was denied access while resolving outside the worktree: `Cannot read directory "../../../..": Access is denied`, followed by failure to resolve `./server/index.ts`. This was a sandbox filesystem denial, not a TypeScript or application-build failure.

The same `npm.cmd run build` was then run with direct/elevated filesystem access in this exact worktree and exited 0: Vite built 1,839 modules and emitted `dist/client`; tsup emitted `dist/server/index.js` successfully in 464 ms. `dist/` remains ignored and is not part of the commit.

### Live database boundary

`TEST_DATABASE_URL_PRESENT=False` and `TEST_DATABASE_DISPOSABLE=False` were observed without exposing any credential. The integration command therefore failed closed with:

```text
TEST_DATABASE_URL is required for database integration tests; use a disposable Neon branch
```

No live PostgreSQL acceptance is claimed. The suite is ready for a separately supplied disposable branch using both environment variables.

## Changed Files

- Contracts/calculations: `shared/contracts.ts`, `shared/contracts.test.ts`, `shared/budgeting.ts`, `shared/budgeting.test.ts`
- Income API/storage: `server/budgets/store.ts`, `server/budgets/drizzle-budget-store.ts`, `server/budgets/routes.ts`, `server/budgets/routes.test.ts`
- Vault API/storage: `server/vaults/store.ts`, `server/vaults/drizzle-vault-store.ts`, `server/vaults/routes.ts`, `server/vaults/routes.test.ts`
- History: `client/pages/HistoryPage.tsx`, `client/pages/HistoryPage.test.tsx`
- Database acceptance/config: `server/db/integration.test.ts`, `vitest.integration.config.ts`, `.env.example`
- Corrected documentation: `docs/superpowers/specs/2026-09-03-budgeting-intelligence-design.md`, `docs/superpowers/plans/2026-09-03-budgeting-foundation.md`

The exact final commit SHA is reported in the post-commit handoff. This report is part of that commit, so it cannot embed its own content-addressed Git SHA.

## Round 2 Re-review Fixes

Round-2 starting SHA: `1b44959593ff92d30acec553fa492ce879354fa2`

### Findings addressed

1. **Repeating-ratio Budget Score precision**
   - The scoped Decimal precision is now `max(16, widestOperand + 2)`. The dynamic growth guard still preserves the maximum-value arithmetic from round 1, while the minimum supplies sufficient significant digits before the two-decimal percentage rounding boundary.
   - Added literal regressions for `0.01 / 0.03 * 100 = 33.33` and `0.06 / 0.07 * 100 = 85.71`.

2. **Failure-safe disposable integration cleanup**
   - Added a test-only `CleanupRegistry` that registers cleanup immediately, executes in LIFO order so child rows are removed before parents, attempts every registered step even after an individual failure, and aggregates cleanup errors.
   - Concurrent contribution setup now uses `Promise.allSettled` through `settleAndRegister`, registering every fulfilled insert before surfacing any sibling rejection. The delete/contribution race applies the same failure-safe result handling.
   - Every generated record ID is registered immediately after its create result. Known month/schema cleanup is registered before mutation. A deterministic ID is supplied and pre-registered for the constraint probe.
   - Canonical General Savings restoration is registered before repair, removes the test contribution first, and restores `name`, `emoji`, target amount/date, status, and the exact pre-existing `updatedAt`. A canonical row created solely by the test is deleted instead.

### Round-2 RED/GREEN evidence

| Cycle | RED | GREEN |
|---|---|---|
| Budget division precision | `npm.cmd test -- shared/budgeting.test.ts` -> 2 failed, 38 passed; received `33.30`/`85.70` instead of `33.33`/`85.71` | Same command -> 40/40 passed |
| Partial-setup cleanup | `npm.cmd test -- server/db/integration-cleanup.test.ts` -> 2/2 failed; cleanup stopped at the failing child and `Promise.all` lost the fulfilled sibling | Same command -> 2/2 passed |

### Round-2 final verification

| Command | Result |
|---|---|
| `npm.cmd test -- shared/budgeting.test.ts server/db/integration-cleanup.test.ts server/db/schema.test.ts` | exit 0; 3 files, 44 tests passed |
| `npm.cmd test` | exit 0; 17 files, 177 tests passed |
| `npm.cmd run typecheck` | exit 0; `tsc --noEmit` |
| `npm.cmd run db:check` | exit 0; Drizzle Kit: `Everything's fine` |
| `git diff --check` | exit 0; no whitespace errors after report append |
| `npm.cmd run test:integration` | exit 1 by the existing fail-closed guard; 10 tests skipped because `TEST_DATABASE_URL` is absent |

No live PostgreSQL execution is claimed and no database was touched. The production build was not rerun for round 2: the scoped changes are a pure arithmetic precision bound and integration-test-only support/setup, with no entrypoint, dependency, schema, route, build configuration, or bundler-graph change. Fresh full tests and TypeScript checking compiled the affected application module. The successful elevated production build from round 1 remains recorded above and is not represented as fresh round-2 build evidence.

Round-2 files: `shared/budgeting.ts`, `shared/budgeting.test.ts`, `server/db/integration-cleanup.ts`, `server/db/integration-cleanup.test.ts`, `server/db/integration.test.ts`, and this appended report section.

The exact round-2 commit SHA is reported in the post-commit handoff for the same content-addressing reason noted above.

## Round 3 Arithmetic Re-review Fix

Round-3 starting SHA: `a09562606e7b7ff26c434e5a5bdd93e9cfdd60f0`

The remaining near-clamp rounding case exposed that `max(16, widestOperand + 2)` could round a valid high-magnitude ratio to the half-cent boundary before `toFixed(2)`. The scoped calculation precision is now `max(16, widestOperand + 4)`, retaining a minimum for small repeating ratios and four growth/rounding guard digits for maximum-width operands.

### Round-3 RED/GREEN evidence

- RED: `npm.cmd test -- shared/budgeting.test.ts` exited 1 with 1 failed and 40 passed. For salary `999999999999999999.99` and savings `999949999999999999.99`, the implementation returned `100.00` instead of the exact two-decimal result `99.99`.
- GREEN: the same focused command exited 0 with 41/41 passed. This includes `33.33`, `85.71`, the new `99.99` boundary, maximum-value income/Amount left, zero income, clamps, and negative shortfalls.

### Round-3 final verification

| Command | Result |
|---|---|
| `npm.cmd test -- shared/budgeting.test.ts` | exit 0; 1 file, 41 tests passed |
| `npm.cmd test` | exit 0; 17 files, 178 tests passed |
| `npm.cmd run typecheck` | exit 0; `tsc --noEmit` |
| `npm.cmd run db:check` | exit 0; Drizzle Kit: `Everything's fine` |
| `git diff --check` | exit 0 after this report append |

The production build and disposable-database integration suite were not rerun for this arithmetic-only change. No entrypoint, dependency, schema, route, build configuration, or integration harness changed. The prior elevated production build passed, and the previously recorded integration boundary remains unchanged: `TEST_DATABASE_URL` is absent, so no live database acceptance is claimed.

Round-3 files are limited to `shared/budgeting.ts`, `shared/budgeting.test.ts`, and this report. The exact round-3 commit SHA is reported in the post-commit handoff.

## Round 4 Exact Budget Score Arithmetic

Round-4 starting SHA: `6fb19b66883fa13bc23cec96ebe1148241aa20d7`

The high-magnitude ratio in the fourth review demonstrated that adding finite Decimal guard digits cannot prove correct percentage rounding for every valid money pair. Budget Score no longer uses Decimal division. Salary, additional income, and savings are converted exactly to integer cents; savings cents are multiplied by 10,000 to produce a rational basis-point numerator; division and the remainder comparison perform exact half-up rounding; and the result is clamped to 0..10,000 basis points before two-decimal formatting. Decimal remains scoped to monetary sums and differences, where the existing operand-growth precision preserves exact cents.

### Round-4 RED/GREEN evidence

- RED: `npm.cmd test -- shared/budgeting.test.ts` exited 1 with 1 failed and 41 passed. For salary `999999999999999999.99`, additional income `999999999999999800.04`, and savings `666699999999999933.34`, the Decimal division returned `33.34` instead of `33.33`.
- GREEN: the same focused command exited 0 with 42/42 passed. The suite retains the earlier `33.33`, `85.71`, `99.99`, 100 clamp, zero-income, maximum-income/Amount-left, and negative-shortfall regressions.

### Round-4 final verification

| Command | Result |
|---|---|
| `npm.cmd test -- shared/budgeting.test.ts` | exit 0; 1 file, 42 tests passed |
| `npm.cmd test` | exit 0; 17 files, 179 tests passed |
| `npm.cmd run typecheck` | exit 0; `tsc --noEmit` |
| `npm.cmd run db:check` | exit 0; Drizzle Kit: `Everything's fine` |
| `git diff --check` | exit 0 after this report append |

The production build and disposable-database integration suite were not rerun, as directed for this arithmetic-only source/test change. No dependency, schema, route, build configuration, or integration harness changed. The prior elevated production build remains the latest build evidence; `TEST_DATABASE_URL` remains absent, so no live database acceptance is claimed.

Round-4 files are limited to `shared/budgeting.ts`, `shared/budgeting.test.ts`, and this report. The exact round-4 commit SHA is reported in the post-commit handoff.
