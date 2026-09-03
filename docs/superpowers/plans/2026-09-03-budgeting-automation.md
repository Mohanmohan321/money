# Receipt and Subscription Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-preserving Snap Receipt entry and a reviewable recurring-subscription detector, then connect both to Dashboard, spending forecasts, calendars, and complete end-to-end acceptance.

**Architecture:** Receipt OCR runs in a lazily loaded browser worker; pure parsing code turns recognized text into editable candidates, and only confirmed transaction fields reach the API. Subscription detection is deterministic server logic over persisted categorized transactions; candidate review state is stored in PostgreSQL and actual spending remains separate from forecast spending.

**Tech Stack:** React 19, TypeScript 6, Tesseract.js browser worker, Express 5, Drizzle ORM, PostgreSQL/Neon, Decimal.js, Luxon, Vitest, Testing Library, Supertest, Playwright

## Global Constraints

- Complete the foundation and surfaces plans first.
- Receipt images and recognized OCR text must not be uploaded or persisted; only confirmed merchant, amount, and category reach the transaction API.
- OCR cannot create a transaction without explicit user confirmation.
- Use a rear-camera file input on supported phones and ordinary image upload on desktop.
- Subscription candidates require at least two matching transactions.
- Weekly gaps are 5-9 days; monthly gaps are 25-35 days; amounts must be within 10% of the candidate median.
- Confirmed subscriptions affect forecast values only. They affect actual Spending only when a real transaction exists.
- Every candidate exposes supporting transactions, cadence, expected amount, next estimated date, monthly equivalent, annual cost, confidence, and review state.
- Preserve the 16 KiB JSON body limit because receipt binary data never enters Express.
- OCR loading, unsupported image, camera denial, empty recognition, low confidence, parsing failure, and API save failure each require recoverable UI states.

---

## File Structure

- `client/receipt/parser.ts`: pure merchant/total extraction from OCR text.
- `client/receipt/ocr.ts`: lazy Tesseract worker adapter with progress and cleanup.
- `client/components/SnapReceipt.tsx`: capture, scan, review, correct, confirm.
- `server/subscriptions/detector.ts`: pure merchant normalization and recurrence detection.
- `server/subscriptions/*`: review persistence and authenticated endpoints.
- `client/components/SubscriptionDetector.tsx`: candidate, confirmation, dismissal, and forecast UI.
- `server/planning/drizzle-planning-store.ts`: confirmed-payment calendar marker integration.

### Task 1: Receipt Text Parser and OCR Adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `client/receipt/parser.ts`
- Create: `client/receipt/parser.test.ts`
- Create: `client/receipt/ocr.ts`
- Create: `client/receipt/ocr.test.ts`

**Interfaces:**
- Produces: `parseReceiptText(text)`, `validateReceiptImage(file)`, and `recognizeReceipt(file, onProgress)`.
- Consumes: `categorizeTransaction` from the shared budgeting domain and Tesseract.js `createWorker`, `recognize`, and `terminate` APIs.

- [ ] **Step 1: Write failing deterministic parser tests**

```ts
it('extracts merchant, labeled grand total, and category', () => {
  expect(parseReceiptText(`SWIGGY\nOrder 8472\nSubtotal 420.00\nTax 21.00\nGRAND TOTAL ₹441.00`)).toEqual({
    merchant: 'SWIGGY', amount: '441.00', category: 'food', confidence: 'high',
  });
});

it('prefers amount due over subtotal and ignores phone/order numbers', () => {
  expect(parseReceiptText(`APOLLO PHARMACY\nPhone 9876543210\nSubtotal 800.00\nAmount Due 845.50`))
    .toEqual({ merchant: 'APOLLO PHARMACY', amount: '845.50', category: 'health', confidence: 'high' });
});

it('returns an editable low-confidence result when no labeled total exists', () => {
  expect(parseReceiptText(`Corner Cafe\n120.00\n135.00`)).toEqual({
    merchant: 'Corner Cafe', amount: '135.00', category: 'coffee', confidence: 'low',
  });
});
```

Test comma separators, `Rs`, currency symbols, CRLF, blank text, malformed decimals, negative/refund lines, and totals beyond database precision.

- [ ] **Step 2: Run parser tests and verify missing-module failure**

Run: `npm.cmd test -- client/receipt/parser.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement deterministic parsing rules**

Normalize CRLF, trim lines, and discard blank lines. Merchant is the first nonnumeric line that does not match `/^(receipt|invoice|tax invoice|order|tel|phone|gstin)\b/i` and is not more than 50% digits. Total labels have this priority: `grand total`, `amount due`, `total paid`, then standalone `total`. Parse the last valid amount on the highest-priority matching line. If no label matches, consider only values with a currency symbol/prefix or exactly two fractional digits, select the largest, and mark confidence low. Validate the chosen string with `moneySchema`; return `undefined` amount instead of throwing when invalid.

```ts
export interface ReceiptCandidate {
  merchant: string; amount?: string; category: SpendingCategory; confidence: 'high' | 'low';
}
```

- [ ] **Step 4: Install Tesseract.js and write the adapter test first**

Run: `npm.cmd install tesseract.js`

Then mock only the external worker boundary:

```ts
it('recognizes one image, reports progress, and always terminates the worker', async () => {
  createWorkerMock.mockResolvedValue(worker);
  worker.recognize.mockResolvedValue({ data: { text: 'SWIGGY\nTOTAL 100.00', confidence: 93 } });
  await expect(recognizeReceipt(file, onProgress)).resolves.toEqual({
    text: 'SWIGGY\nTOTAL 100.00', confidence: 93,
  });
  expect(worker.terminate).toHaveBeenCalledOnce();
});
```

Also test worker rejection and confirm `terminate` runs in `finally` after recognition starts.

- [ ] **Step 5: Implement lazy OCR with file validation**

Allow JPEG, PNG, and WebP up to 10 MiB. Reject zero-byte files. Dynamically import the library only when scanning:

```ts
export async function recognizeReceipt(file: File, onProgress: (value: number) => void) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', undefined, {
    logger: ({ status, progress }) => status === 'recognizing text' && onProgress(progress),
  });
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
```

The external OCR dependency is verified against its official worker API before implementation; do not use the deprecated one-shot browser global.

- [ ] **Step 6: Run receipt unit tests and production build**

Run: `npm.cmd test -- client/receipt`

Expected: PASS.

Run: `npm.cmd run build:client`

Expected: exit 0 and Tesseract code appears in a lazy chunk rather than the initial application chunk.

- [ ] **Step 7: Commit receipt foundations**

```powershell
git add package.json package-lock.json client/receipt
git commit -m "feat: add local receipt recognition"
```

### Task 2: Snap Receipt Capture and Confirmation Flow

**Files:**
- Create: `client/components/SnapReceipt.tsx`
- Create: `client/components/SnapReceipt.test.tsx`
- Modify: `client/pages/AddPage.tsx`
- Modify: `client/pages/DashboardPage.tsx`
- Modify: `client/styles.css`
- Modify: `server/app.ts`
- Modify: `server/app.test.ts`

**Interfaces:**
- Produces: camera/upload entry, scan progress, editable review form, confirmed transaction creation, and caller refresh.
- Consumes: receipt parser/adapter, `api.createTransaction`, and `CategoryBadge`.

- [ ] **Step 1: Write failing capture-to-confirmation tests**

```tsx
it('does not change spending until the reviewed receipt is confirmed', async () => {
  recognizeReceiptMock.mockResolvedValue({ text: 'SWIGGY\nGRAND TOTAL 441.00', confidence: 94 });
  const user = userEvent.setup();
  render(<SnapReceipt onSaved={onSaved} />);
  await user.upload(screen.getByLabelText('Receipt image'), receiptFile);
  await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
  expect(await screen.findByLabelText('Merchant')).toHaveValue('SWIGGY');
  expect(screen.getByLabelText('Amount')).toHaveValue('441.00');
  expect(api.createTransaction).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm spending' }));
  expect(api.createTransaction).toHaveBeenCalledWith('SWIGGY', '441.00', 'food');
  expect(onSaved).toHaveBeenCalled();
});
```

Add tests for correction before save, cancel/discard, low-confidence warning, invalid format, file too large, OCR failure, empty OCR, API rejection, disabled buttons, and progress semantics.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm.cmd test -- client/components/SnapReceipt.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the four-state component**

Use states `idle`, `scanning`, `review`, and `saving`. The file input has `accept="image/jpeg,image/png,image/webp"` and `capture="environment"`. Revoke object-preview URLs during replacement and unmount. Scanning displays a native progress element and status text. Review exposes required Merchant, Amount, and Category fields. Confirm calls the ordinary categorized transaction endpoint; cancel clears file, preview, recognized text, and candidate.

- [ ] **Step 4: Place Snap Receipt on Dashboard and Add**

Dashboard renders a compact Snap Receipt action below Recent Transactions. Add renders it above manual entry so both routes share one component. Dashboard `onSaved` refetches monthly analysis and existing daily dashboard data. Add `onSaved` shows Transaction saved and resets the scanner.

- [ ] **Step 5: Allow the documented worker runtime without weakening other headers**

Configure Helmet CSP only for Tesseract's required browser worker/WASM and model download: retain `default-src 'self'`; set `worker-src 'self' blob:`; set `script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net`; and set `connect-src 'self' https://cdn.jsdelivr.net`. Add an app test that asserts authentication and all existing headers remain enabled. Do not add `unsafe-inline` or wildcard origins.

- [ ] **Step 6: Run Snap Receipt, application, and security tests**

Run: `npm.cmd test -- client/components/SnapReceipt.test.tsx client/App.test.tsx server/app.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit the receipt experience**

```powershell
git add client/components/SnapReceipt.tsx client/components/SnapReceipt.test.tsx client/pages/AddPage.tsx client/pages/DashboardPage.tsx client/styles.css server/app.ts server/app.test.ts
git commit -m "feat: add confirmed receipt capture flow"
```

### Task 3: Subscription Detection Domain and Persistence

**Files:**
- Modify: `server/db/schema.ts`
- Create: next generated file under `drizzle/`
- Modify: `drizzle/meta/_journal.json`
- Create: generated Drizzle metadata snapshot
- Create: `server/subscriptions/detector.ts`
- Create: `server/subscriptions/detector.test.ts`
- Create: `server/subscriptions/store.ts`
- Create: `server/subscriptions/drizzle-subscription-store.ts`
- Create: `server/subscriptions/routes.ts`
- Create: `server/subscriptions/routes.test.ts`
- Modify: `shared/contracts.ts`

**Interfaces:**
- Produces: `normalizeMerchant`, `detectSubscriptions`, `SubscriptionCandidate`, review-state storage, GET `/api/subscriptions/candidates`, and PUT `/api/subscriptions/:merchantKey/review`.
- Consumes: categorized transaction history, Decimal.js, and Luxon UTC timestamps.

- [ ] **Step 1: Write failing recurrence-detector tests**

```ts
it('detects a monthly subscription with a small price change', () => {
  const candidates = detectSubscriptions([
    tx('Netflix payment', '649.00', '2026-07-02T10:00:00.000Z'),
    tx('NETFLIX 849201', '699.00', '2026-08-01T10:00:00.000Z'),
  ], new Date('2026-08-02T00:00:00.000Z'));
  expect(candidates[0]).toEqual(expect.objectContaining({
    merchantKey: 'netflix', cadence: 'monthly', typicalAmount: '674.00',
    monthlyEquivalent: '674.00', annualCost: '8088.00', confidence: 'medium',
  }));
});

it('rejects amount drift above ten percent and gaps outside cadence windows', () => {
  expect(detectSubscriptions([
    tx('Service', '100.00', '2026-06-01T00:00:00.000Z'),
    tx('Service', '150.00', '2026-07-20T00:00:00.000Z'),
  ], now)).toEqual([]);
});
```

Also cover weekly cadence, three occurrences/high confidence, median for odd/even samples, annual conversion `weekly * 52` and `monthly * 12`, case/punctuation/order-number normalization, stable next date, one-off duplicates, and Decimal boundary values.

- [ ] **Step 2: Run detector tests and verify missing-module failure**

Run: `npm.cmd test -- server/subscriptions/detector.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement exact normalization and recurrence rules**

Normalize with Unicode NFKC, lowercase, replace punctuation/digits with spaces, remove tokens `payment`, `paid`, `purchase`, `order`, `upi`, `card`, and `txn`, collapse whitespace, and keep the first four tokens. Group by nonempty key, order by timestamp, and evaluate consecutive gaps. Two matching events produce medium confidence; three or more produce high confidence. Use the median amount as typical amount and compare each amount with `abs(amount - median) / median <= 0.10`.

For weekly next date, add seven days to the latest timestamp; for monthly, add one calendar month in `APP_TIMEZONE`. Monthly equivalent is weekly median times 52 divided by 12 or the monthly median. Return fixed two-decimal strings.

- [ ] **Step 4: Write failing persistence and route tests**

```ts
it('merges detected candidates with confirmed and dismissed review state', async () => {
  const before = await agent.get('/api/subscriptions/candidates').expect(200);
  expect(before.body.data.items[0].reviewStatus).toBe('pending');
  const key = encodeURIComponent(before.body.data.items[0].merchantKey);
  await agent.put(`/api/subscriptions/${key}/review`).send({ status: 'confirmed' }).expect(200);
  const after = await agent.get('/api/subscriptions/candidates').expect(200);
  expect(after.body.data.items[0].reviewStatus).toBe('confirmed');
  expect(after.body.data.confirmedMonthlyForecast).toBe('674.00');
});
```

Test invalid status, overlong/empty merchant keys, absent candidate, dismissal persistence, supporting IDs, and authentication.

- [ ] **Step 5: Add review contracts and schema**

```ts
export const subscriptionReviewStatusSchema = z.enum(['confirmed', 'dismissed']);
export interface SubscriptionCandidate {
  merchantKey: string; merchant: string; category: SpendingCategory;
  typicalAmount: string; cadence: 'weekly' | 'monthly'; nextExpectedAt: string;
  monthlyEquivalent: string; annualCost: string; confidence: 'medium' | 'high';
  supportingTransactionIds: string[]; reviewStatus: 'pending' | 'confirmed' | 'dismissed';
}
export interface SubscriptionCandidateList {
  items: SubscriptionCandidate[]; confirmedMonthlyForecast: string;
}
```

Add `subscription_reviews` with `merchant_key` primary key, status, cadence, representative amount, JSONB supporting IDs, next expected timestamp, and created/updated timestamps. Add checks for positive representative amount and valid status/cadence values.

- [ ] **Step 6: Generate and verify the migration**

Run: `npm.cmd run db:generate -- --name subscriptions`

Expected: one additive migration creates `subscription_reviews` without altering financial records.

Run: `npm.cmd run db:check`

Expected: exit 0.

- [ ] **Step 7: Implement store and router**

`listCandidates(now, timezone)` loads transactions, detects candidates, left-merges reviews, and returns pending plus confirmed candidates; dismissed candidates are omitted from the visible list but remain persisted. `reviewCandidate` reruns detection, rejects unknown/stale keys with `SUBSCRIPTION_CANDIDATE_NOT_FOUND`, and upserts the candidate snapshot and status. Sum confirmed monthly equivalents using Decimal.js.

- [ ] **Step 8: Run subscription tests**

Run: `npm.cmd test -- server/subscriptions`

Expected: PASS.

- [ ] **Step 9: Commit subscription domain and migration**

```powershell
git add shared/contracts.ts server/db/schema.ts server/subscriptions drizzle
git commit -m "feat: detect and review subscriptions"
```

### Task 4: Subscription Dashboard and Calendar Integration

**Files:**
- Create: `client/components/SubscriptionDetector.tsx`
- Create: `client/components/SubscriptionDetector.test.tsx`
- Modify: `client/api.ts`
- Modify: `client/pages/DashboardPage.tsx`
- Modify: `server/planning/drizzle-planning-store.ts`
- Modify: `server/planning/calculations.test.ts`
- Modify: `client/styles.css`
- Modify: `index.ts`

**Interfaces:**
- Produces: candidate review cards, confirmed forecast, next-payment display, and calendar markers for actual confirmed matching transactions.
- Consumes: subscription routes, category presentation, and breakdown calendar contract.

- [ ] **Step 1: Write failing Dashboard interaction tests**

```tsx
it('confirms a candidate and shows forecast separately from actual spending', async () => {
  const user = userEvent.setup();
  render(<SubscriptionDetector data={subscriptionData} actualSpending="12000.00" onRefresh={onRefresh} />);
  expect(screen.getByText('Projected subscriptions')).toHaveTextContent('674.00');
  expect(screen.getByText('Actual monthly spending')).toHaveTextContent('12,000.00');
  await user.click(screen.getByRole('button', { name: 'Confirm Netflix subscription' }));
  expect(api.reviewSubscription).toHaveBeenCalledWith('netflix', 'confirmed');
  expect(onRefresh).toHaveBeenCalled();
});
```

Add dismissal, supporting transaction disclosure, next date, annual cost, empty candidates, error, and disabled-state assertions.

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm.cmd test -- client/components/SubscriptionDetector.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Add client API methods and component**

```ts
subscriptions: () => apiRequest<SubscriptionCandidateList>('/api/subscriptions/candidates'),
reviewSubscription: (merchantKey: string, status: 'confirmed' | 'dismissed') =>
  apiRequest<SubscriptionCandidate>(`/api/subscriptions/${encodeURIComponent(merchantKey)}/review`, {
    method: 'PUT', body: JSON.stringify({ status }),
  }),
```

Render each pending/confirmed candidate with category icon, merchant, typical amount, cadence, next date, monthly and annual projections, confidence, and expandable supporting transactions. Pending cards show Confirm and Not a subscription. Confirmed cards show Confirmed and allow dismissal. Forecast copy explicitly says it is not included in actual spending.

- [ ] **Step 4: Integrate Dashboard loading and refresh**

Load subscriptions alongside Dashboard planning data, Vaults, and Net Worth. Place the section after Vault Goals and before the existing daily snapshot. A review refetches subscription data only.

- [ ] **Step 5: Mark actual confirmed subscription payments in calendar data**

During Breakdown aggregation, normalize each transaction merchant and join it to confirmed review keys in application code after bounded SQL queries. Increment `subscriptionPaymentCount` on the transaction's actual local date. Do not add forecast-only future dates to the calendar and do not change spending totals.

- [ ] **Step 6: Wire production route and run tests**

Mount `createSubscriptionRouter` behind authentication in `index.ts`.

Run: `npm.cmd test -- server/subscriptions server/planning client/components/SubscriptionDetector.test.tsx client/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit subscription surfaces**

```powershell
git add index.ts client/api.ts client/pages/DashboardPage.tsx client/components/SubscriptionDetector.tsx client/components/SubscriptionDetector.test.tsx client/styles.css server/planning
git commit -m "feat: add subscription insights"
```

### Task 5: Complete Acceptance, Security, and Documentation

**Files:**
- Modify: `server/db/integration.test.ts`
- Modify: `e2e/mobile-money-flow.spec.ts`
- Create: `e2e/database-cleanup.ts`
- Modify: `README.md`
- Modify: `.env.example` only if OCR configuration actually becomes necessary

**Interfaces:**
- Produces: full-system proof for receipt entry, subscription review, Dashboard recalculation, calendar markers, annual reporting, and database cleanup.
- Consumes: every deliverable from all three plans.

- [ ] **Step 1: Extend the database integration test first**

Create uniquely named recurring transactions, run detection, persist confirmation, verify review retrieval, verify the matched calendar day marker, and delete only the created review and transactions in `finally`. Assert subscription forecasts are decimal strings and actual Spending is unchanged by confirmation.

- [ ] **Step 2: Add a deterministic browser receipt fixture at runtime**

In Playwright, open a blank page with large black text `SWIGGY`, `GRAND TOTAL`, and a unique amount on a white background, call `page.screenshot()` to obtain a PNG buffer, then set the Receipt image input with `{ name: 'receipt.png', mimeType: 'image/png', buffer }`. This avoids committing opaque binary fixtures and exercises real OCR.

- [ ] **Step 3: Extend the mobile end-to-end path**

After authentication:

1. Save current-month salary, spending limit, and savings target.
2. Add additional income.
3. Scan the generated receipt, review fields, and confirm.
4. Verify Spending and Amount left update only after confirmation.
5. Create a Trip Vault and contribute.
6. Verify Savings, Budget Score, and Amount left refresh.
7. Create repeated subscription transactions through API setup, confirm the detected candidate, and verify forecast remains separate.
8. Add one asset and liability, plus lent and borrowed records, and verify total owned, total owed, and Net Worth.
9. Verify Monthly Budget, calendar Breakdown, and Annual Report tabs.

Track every created ID and delete only those records in `finally`, including income, Vault contribution/Vault, asset, liability, transaction, lending, borrowing, and subscription review data. Because Vault contributions and subscription decisions are intentionally immutable through the product API, `e2e/database-cleanup.ts` connects through the same test `DATABASE_URL`, accepts explicit IDs only, deletes contribution/review rows before their parents, and refuses to run when `NODE_ENV` is `production`. It never truncates a table.

- [ ] **Step 4: Verify responsive and accessible behavior**

On mobile Chromium, assert no document-level horizontal overflow at 390 px, category/month rails remain locally scrollable, camera input exists, and all buttons are reachable. On desktop Firefox, assert calendar details sit beside the calendar and chart data tables are available. Run an accessibility snapshot or role assertions for tabs, progress, charts, dialogs, alerts, and form labels.

- [ ] **Step 5: Update README with operational truth**

Document budget equations, category rules, receipt privacy/confirmation, the first OCR model download and browser cache behavior, supported image formats/size, subscription thresholds, forecast-versus-actual semantics, Net Worth composition, migrations, routes, and test requirements. Do not add a receipt API or OCR secret to `.env.example` because none exists.

- [ ] **Step 6: Run full verification from a clean process**

Run: `npm.cmd test`

Expected: all unit/component/API tests PASS with zero failures.

Run: `npm.cmd run typecheck`

Expected: exit 0.

Run: `npm.cmd run build`

Expected: exit 0.

Run: `npm.cmd run db:check`

Expected: exit 0.

Run: `npm.cmd run test:integration`

Expected with migrated `TEST_DATABASE_URL`: PASS and targeted cleanup succeeds.

Run: `npm.cmd run test:e2e`

Expected with migrated `DATABASE_URL` and both processes running: mobile Chromium and desktop Firefox PASS, including real browser OCR. If database or browser prerequisites are absent, report exactly which live checks remain unverified.

- [ ] **Step 7: Review the final diff against the approved design**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended implementation, generated migration, lockfile, tests, and documentation are changed.

- [ ] **Step 8: Commit the complete automation phase**

```powershell
git add package.json package-lock.json client server shared drizzle e2e README.md
git commit -m "feat: complete budgeting automation"
```
