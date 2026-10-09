import { expect, test } from '@playwright/test';
import { DEFAULT_BUDGET_SETTINGS, buildBudgetMonth, type BudgetExpense } from '../shared/budget-workspace';

test('budget workspace is responsive, keyboard operable, and refreshes saved data', async ({ page }) => {
  let expenses: BudgetExpense[] = [];
  const workspace = () => buildBudgetMonth({
    month: '2026-10', today: '2026-10-09', settings: DEFAULT_BUDGET_SETTINGS,
    overrides: [{ date: '2026-10-09', plannedAmount: '200.00', note: null }],
    explicitZeroDates: [], expenses,
  });
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { success: true, data: { authenticated: true } } }));
  await page.route('**/api/budget/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/expenses')) {
      const input = request.postDataJSON() as { expenseDate: string; amount: string; budgetCategory: string; description: string; notes?: string; idempotencyKey: string };
      const item: BudgetExpense = { id: input.idempotencyKey, expenseDate: input.expenseDate, amount: `${Number(input.amount).toFixed(2)}`, budgetCategory: input.budgetCategory, description: input.description, notes: input.notes ?? null, createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' };
      expenses = [item];
      await route.fulfill({ status: 201, json: { success: true, data: item } }); return;
    }
    await route.fulfill({ json: { success: true, data: workspace() } });
  });

  await page.goto('/budget');
  await expect(page.getByRole('heading', { name: 'Budget overview' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).first()).toContainText('Budget Calendar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const calendarTab = page.getByRole('tab', { name: 'Calendar' });
  await calendarTab.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Trends' })).toBeFocused();
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: /October 9, 2026.*planned ₹200.00/ }).click();
  const dialog = page.getByRole('dialog', { name: 'October 9, 2026 expenses' });
  await expect(dialog).toBeVisible(); await expect(dialog.getByLabel('Amount')).toBeFocused();
  await dialog.getByLabel('Amount').fill('250'); await dialog.getByLabel('Expense category').selectOption('lunch');
  await dialog.getByLabel('Description').fill('Lunch'); await dialog.getByRole('button', { name: 'Save expense' }).click();
  await expect(dialog.getByText('Over budget by ₹50.00')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
