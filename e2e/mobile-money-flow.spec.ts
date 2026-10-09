import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import { backdateE2eTransactions, cleanupE2eDatabase } from './database-cleanup';

const createdRecordSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    amount: z.string().regex(/^\d+\.\d{2}$/),
    createdAt: z.string().datetime(),
  }).passthrough(),
});

async function unlock(page: Page) {
  await page.goto('/');
  await page.getByLabel('Password').fill(process.env.APP_PASSWORD ?? '2003');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: "Today's snapshot" })).toBeVisible();
}

test('login, log all three record types, and see them in unified history', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const transactionLabel = `Mobile fuel ${suffix}`;
  const lentPerson = `Maya ${suffix}`;
  const borrowedPerson = `Arun ${suffix}`;
  const created: Array<{ resource: string; id: string }> = [];

  await unlock(page);

  try {
    await test.step('log a transaction without a date field', async () => {
      await page.getByRole('link', { name: 'Add' }).click();
      await page.getByLabel('Description').fill(transactionLabel);
      await page.getByLabel('Amount').fill('10.10');
      const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/transactions') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Save transaction' }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const payload = createdRecordSchema.parse(await response.json());
      created.push({ resource: 'transactions', id: payload.data.id });
      await expect(page.getByRole('status')).toHaveText('Transaction saved');
      await expect(page.getByLabel(/date|time/i)).toHaveCount(0);
    });

    await test.step('log money lent', async () => {
      await page.getByRole('tab', { name: 'Money lent' }).click();
      await page.getByLabel('Person name').fill(lentPerson);
      await page.getByLabel('Amount').fill('20.20');
      const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/lent') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Save money lent' }).click();
      const payload = createdRecordSchema.parse(await (await responsePromise).json());
      created.push({ resource: 'lent', id: payload.data.id });
      await expect(page.getByRole('status')).toHaveText('Money lent saved');
    });

    await test.step('log money borrowed', async () => {
      await page.getByRole('tab', { name: 'Money borrowed' }).click();
      await page.getByLabel('Person name').fill(borrowedPerson);
      await page.getByLabel('Amount').fill('30.30');
      const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/borrowed') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Save money borrowed' }).click();
      const payload = createdRecordSchema.parse(await (await responsePromise).json());
      created.push({ resource: 'borrowed', id: payload.data.id });
      await expect(page.getByRole('status')).toHaveText('Money borrowed saved');
    });

    await test.step('verify unified history', async () => {
      await page.getByRole('link', { name: 'History' }).click();
      await expect(page.getByText(transactionLabel)).toBeVisible();
      await expect(page.getByText(lentPerson)).toBeVisible();
      await expect(page.getByText(borrowedPerson)).toBeVisible();
    });
  } finally {
    for (const record of created) {
      await page.request.delete(`/api/${record.resource}/${record.id}`);
    }
  }
});

test('wrong password produces a clear error without entering the app', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid password');
  await expect(page.getByRole('heading', { name: "Today's snapshot" })).toHaveCount(0);
});

test('Budget Calendar records and removes an isolated daily expense on mobile and desktop', async ({ page }, testInfo) => {
  await unlock(page);
  const description = `Calendar meal ${randomUUID().slice(0, 8)}`;
  const writePaths: string[] = [];
  let expenseId = '';
  page.on('request', (request) => {
    if (request.method() !== 'GET') writePaths.push(new URL(request.url()).pathname);
  });

  try {
    const calendarResponse = page.waitForResponse((response) => (
      response.url().includes('/api/budget-calendar/months/')
      && response.url().endsWith('/calendar')
      && response.request().method() === 'GET'
    ));
    await page.getByRole('link', { name: 'Budget Calendar' }).click();
    const calendarPayload = await (await calendarResponse).json();
    const today = calendarPayload.data.today as string;
    const [year, month, day] = today.split('-').map(Number);
    const dateLabel = new Intl.DateTimeFormat('en', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));

    await page.getByRole('button', { name: new RegExp(`^${dateLabel}, planned`) }).click();
    const editor = page.getByRole('dialog', { name: dateLabel });
    await expect(editor).toBeVisible();
    await editor.getByLabel('Actual spending').fill('12.34');
    await editor.getByLabel(/Description/).fill(description);
    const createResponse = page.waitForResponse((response) => (
      response.url().endsWith('/api/budget-calendar/expenses')
      && response.request().method() === 'POST'
    ));
    await editor.getByRole('button', { name: 'Save expense' }).click();
    const created = createdRecordSchema.parse(await (await createResponse).json());
    expenseId = created.data.id;
    await expect(editor.getByRole('status')).toHaveText('Expense saved');
    await expect(editor.getByText(description)).toBeVisible();
    expect(writePaths).toContain('/api/budget-calendar/expenses');
    expect(writePaths).not.toContain('/api/transactions');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    if (testInfo.project.name === 'mobile-chromium') {
      const box = await editor.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  } finally {
    if (expenseId) await page.request.delete(`/api/budget-calendar/expenses/${expenseId}`);
  }
});

test('budgeting surfaces keep mobile order and expose desktop report equivalents', async ({ page }, testInfo) => {
  await unlock(page);

  if (testInfo.project.name === 'mobile-chromium') {
    await page.setViewportSize({ width: 390, height: 844 });
    const headings = ['Monthly budget', 'Net worth', 'Recent transactions', 'Vault Goals', "Today's snapshot"];
    const positions = await Promise.all(headings.map(async (name) => page.getByRole('heading', { name }).evaluate((element) => element.getBoundingClientRect().top + window.scrollY)));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('link', { name: 'Analysis' }).click();
    const monthly = page.getByRole('tab', { name: 'Monthly Budget' });
    await monthly.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Budgeting Breakdown' })).toBeFocused();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    return;
  }

  await page.getByRole('link', { name: 'Analysis' }).click();
  await page.getByRole('tab', { name: 'Budgeting Breakdown' }).click();
  await expect(page.locator('.breakdown-layout')).toBeVisible();
  const columns = await page.locator('.breakdown-layout').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length);
  expect(columns).toBe(2);

  await page.getByRole('tab', { name: 'Annual Report' }).click();
  await expect(page.getByRole('table', { name: 'Monthly income and spending data' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Monthly savings data' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Spending by category data' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Income by source data' })).toBeVisible();
});

test('mobile receipt OCR requires editable confirmation before creating spending', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Receipt camera acceptance runs on mobile Chromium');
  await unlock(page);
  let transactionId = '';
  try {
    await page.setViewportSize({ width: 1200, height: 600 });
    await page.setContent('<main style="background:#fff;color:#000;font:900 96px Arial;padding:80px;line-height:1.35">SWIGGY<br>GRAND TOTAL 441.00</main>');
    const buffer = await page.screenshot();
    await page.goto('/');
    await page.getByRole('link', { name: 'Add' }).click();
    const receiptInput = page.getByLabel('Receipt image');
    await expect(receiptInput).toHaveAttribute('capture', 'environment');
    await receiptInput.setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer });
    await page.getByRole('button', { name: 'Scan receipt' }).click();
    await expect(page.getByLabel('Merchant')).toHaveValue(/SWIGGY/i, { timeout: 120_000 });
    await expect(page.getByLabel('Amount')).toHaveValue('441.00');
    expect((await page.request.get('/api/transactions')).ok()).toBe(true);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/transactions') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm spending' }).click();
    const payload = createdRecordSchema.parse(await (await responsePromise).json());
    transactionId = payload.data.id;
    await expect(page.getByRole('status')).toHaveText('Transaction saved');
  } finally {
    if (transactionId) await page.request.delete(`/api/transactions/${transactionId}`);
  }
});

test('mobile subscription review keeps forecast separate from actual spending', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Subscription review acceptance runs on mobile Chromium');
  test.skip(process.env.TEST_DATABASE_DISPOSABLE !== 'true', 'TEST_DATABASE_DISPOSABLE=true is required');
  await unlock(page);
  const merchantToken = randomUUID().replace(/[^a-f]/g, '').slice(0, 12) || 'abcdef';
  const description = `Stream ${merchantToken}`;
  const transactionIds: string[] = [];
  let merchantKey = '';
  try {
    for (const amount of ['649.00', '699.00']) {
      const response = await page.request.post('/api/transactions', { data: { description, amount, category: 'entertainment' } });
      const payload = createdRecordSchema.parse(await response.json());
      transactionIds.push(payload.data.id);
    }
    const base = new Date();
    await backdateE2eTransactions([
      { id: transactionIds[0], createdAt: new Date(base.getTime() - 60 * 86_400_000) },
      { id: transactionIds[1], createdAt: new Date(base.getTime() - 30 * 86_400_000) },
    ]);
    const candidatesResponse = await page.request.get('/api/subscriptions/candidates');
    const candidates = await candidatesResponse.json();
    const candidate = candidates.data.items.find((item: { supportingTransactionIds: string[] }) => item.supportingTransactionIds.includes(transactionIds[0]));
    expect(candidate).toBeTruthy();
    merchantKey = candidate.merchantKey;

    await page.goto('/');
    const actualBefore = await page.getByText('Actual monthly spending').locator('..').textContent();
    await page.getByRole('button', { name: `Confirm ${candidate.merchant} subscription` }).click();
    await expect(page.getByText('Confirmed')).toBeVisible();
    await expect(page.getByText(/not included in actual spending/i)).toBeVisible();
    expect(await page.getByText('Actual monthly spending').locator('..').textContent()).toBe(actualBefore);
  } finally {
    await cleanupE2eDatabase({ transactionIds, subscriptionMerchantKeys: merchantKey ? [merchantKey] : [] });
  }
});
