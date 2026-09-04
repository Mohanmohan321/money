import { describe, expect, it, vi } from 'vitest';

import type { BudgetStore } from '../budgets/store';
import type { AppDatabase } from '../db/client';
import { DrizzlePlanningStore } from './drizzle-planning-store';

function fakeDependencies() {
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const getBudget = vi.fn().mockResolvedValue({
    month: 'unused', salary: '0.00', spendingLimit: '0.00', savingsTarget: '0.00',
    source: 'suggested' as const,
  });
  return {
    execute,
    getBudget,
    database: { execute } as unknown as AppDatabase,
    budgetStore: { getBudget } as unknown as BudgetStore,
  };
}

describe('DrizzlePlanningStore bounded budget loading', () => {
  it('preserves the single-month BudgetStore lookup', async () => {
    const { database, budgetStore, execute, getBudget } = fakeDependencies();
    const store = new DrizzlePlanningStore(database, budgetStore);

    await store.getMonthly({
      month: '2026-02', timezone: 'UTC',
      range: {
        from: new Date('2026-02-01T00:00:00.000Z'),
        toExclusive: new Date('2026-03-01T00:00:00.000Z'),
      },
      week: {
        from: new Date('2026-02-02T00:00:00.000Z'),
        toExclusive: new Date('2026-02-09T00:00:00.000Z'),
      },
      weekFromLabel: '2026-02-02', weekToLabel: '2026-02-08',
    });

    expect(getBudget).toHaveBeenCalledOnce();
    expect(getBudget).toHaveBeenCalledWith('2026-02');
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('uses one budget batch query for annual analysis', async () => {
    const { database, budgetStore, execute, getBudget } = fakeDependencies();
    const store = new DrizzlePlanningStore(database, budgetStore);

    await store.getAnnual({
      year: '2026', timezone: 'UTC',
      range: {
        from: new Date('2026-01-01T00:00:00.000Z'),
        toExclusive: new Date('2027-01-01T00:00:00.000Z'),
      },
    });

    expect(getBudget).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('uses one budget batch query for breakdown analysis', async () => {
    const { database, budgetStore, execute, getBudget } = fakeDependencies();
    const store = new DrizzlePlanningStore(database, budgetStore);

    await store.getBreakdown({
      year: '2026', selectedMonth: '2026-02', timezone: 'UTC',
      yearRange: {
        from: new Date('2026-01-01T00:00:00.000Z'),
        toExclusive: new Date('2027-01-01T00:00:00.000Z'),
      },
      monthRange: {
        from: new Date('2026-02-01T00:00:00.000Z'),
        toExclusive: new Date('2026-03-01T00:00:00.000Z'),
      },
    });

    expect(getBudget).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('loads typed Vault contributions in the bounded breakdown activity query without N+1 calls', async () => {
    const { database, budgetStore, execute } = fakeDependencies();
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        date: '2026-02-03', income: '0', spending: '0', savings: '25', vaultContributionCount: 1,
      }] })
      .mockResolvedValueOnce({ rows: [{
        type: 'vault-contribution', id: 'contribution-1', description: null, source: null,
        category: null, amount: '25', createdAt: new Date('2026-02-03T09:30:00.000Z'),
        date: '2026-02-03', vaultId: 'vault-1', vaultName: 'Trip', vaultEmoji: '✈️',
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const store = new DrizzlePlanningStore(database, budgetStore);

    const result = await store.getBreakdown({
      year: '2026', selectedMonth: '2026-02', timezone: 'UTC',
      yearRange: { from: new Date('2026-01-01T00:00:00.000Z'), toExclusive: new Date('2027-01-01T00:00:00.000Z') },
      monthRange: { from: new Date('2026-02-01T00:00:00.000Z'), toExclusive: new Date('2026-03-01T00:00:00.000Z') },
    });

    expect(result.days[2]?.activity).toEqual([{
      type: 'vault-contribution', id: 'contribution-1', vaultId: 'vault-1', vaultName: 'Trip', vaultEmoji: '✈️',
      amount: '25.00', createdAt: '2026-02-03T09:30:00.000Z',
    }]);
    expect(result.days[2]?.savings).toBe('25.00');
    expect(result.days[2]?.vaultContributionCount).toBe(1);
    expect(execute).toHaveBeenCalledTimes(5);
  });
});
