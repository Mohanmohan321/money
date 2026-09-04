import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

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
