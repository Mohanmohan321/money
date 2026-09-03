import { describe, expect, it } from 'vitest';

import {
  annualAnalysisQuerySchema,
  budgetBreakdownQuerySchema,
  createPersonRecordSchema,
  createIncomeSchema,
  createTransactionSchema,
  moneySchema,
  monthlyAnalysisQuerySchema,
  updateIncomeSchema,
  updateVaultSchema,
  upsertBudgetSchema,
} from './contracts';

describe('moneySchema', () => {
  it.each([
    ['12', '12.00'],
    ['12.5', '12.50'],
    ['12.50', '12.50'],
    ['00012.50', '12.50'],
  ])('normalizes %s without rounding', (input, expected) => {
    expect(moneySchema.parse(input)).toBe(expected);
  });

  it.each(['', '0', '0.00', '-1', '1.001', '1e3', 'abc', '1000000000000000000']) (
    'rejects invalid money %s',
    (value) => {
      expect(() => moneySchema.parse(value)).toThrow();
    },
  );
});

describe('create record contracts', () => {
  it('trims labels and strips client-supplied generated fields', () => {
    expect(
      createTransactionSchema.parse({
        description: '  Fuel  ',
        amount: '10',
        id: 'client-id',
        createdAt: '2020-01-01T00:00:00Z',
      }),
    ).toEqual({ description: 'Fuel', amount: '10.00' });

    expect(
      createPersonRecordSchema.parse({ personName: '  Maya  ', amount: '2.5' }),
    ).toEqual({ personName: 'Maya', amount: '2.50' });
  });

  it.each(['', '   '])('rejects an empty label %j', (label) => {
    expect(() =>
      createTransactionSchema.parse({ description: label, amount: '1' }),
    ).toThrow();
    expect(() =>
      createPersonRecordSchema.parse({ personName: label, amount: '1' }),
    ).toThrow();
  });
});

describe('budget contracts', () => {
  it('accepts zero plan values and strips generated fields', () => {
    expect(upsertBudgetSchema.parse({ salary: '0', spendingLimit: '20000', savingsTarget: '5000' }))
      .toEqual({ salary: '0.00', spendingLimit: '20000.00', savingsTarget: '5000.00' });
    expect(createIncomeSchema.parse({ source: ' Bonus ', category: 'bonus', amount: '1250' }))
      .toEqual({ source: 'Bonus', category: 'bonus', amount: '1250.00' });
    expect(createTransactionSchema.parse({ description: 'Swiggy', amount: '25', category: 'food' }).category)
      .toBe('food');
  });

  it('normalizes complete Income and Vault update payloads and strips protected fields', () => {
    expect(updateIncomeSchema.parse({
      source: ' Corrected bonus ',
      category: 'bonus',
      amount: '250.5',
      createdAt: '2026-09-01T10:15:00+05:30',
      id: 'client-controlled',
    })).toEqual({
      source: 'Corrected bonus',
      category: 'bonus',
      amount: '250.50',
      createdAt: '2026-09-01T04:45:00.000Z',
    });

    expect(updateVaultSchema.parse({
      name: ' Emergency fund ',
      emoji: ' 🛟 ',
      targetAmount: '50000',
      targetDate: '2027-12-31',
      id: 'client-controlled',
      status: 'archived',
      isGeneral: true,
    })).toEqual({
      name: 'Emergency fund',
      emoji: '🛟',
      targetAmount: '50000.00',
      targetDate: '2027-12-31',
    });
  });

  it('rejects an invalid corrected Income timestamp', () => {
    expect(() => updateIncomeSchema.parse({
      source: 'Bonus', category: 'bonus', amount: '1', createdAt: '2026-09-01',
    })).toThrow();
  });
});

describe('planning query contracts', () => {
  it('validates monthly, breakdown, and annual planning queries', () => {
    expect(monthlyAnalysisQuerySchema.parse({ month: '2026-09', week: '2026-09-03' }))
      .toEqual({ month: '2026-09', week: '2026-09-03' });
    expect(monthlyAnalysisQuerySchema.parse({ month: '2026-09' }))
      .toEqual({ month: '2026-09' });
    expect(budgetBreakdownQuerySchema.parse({ year: '2026', month: '2026-09' }))
      .toEqual({ year: '2026', month: '2026-09' });
    expect(annualAnalysisQuerySchema.parse({ year: '2026' }))
      .toEqual({ year: '2026' });
  });

  it.each([
    ['invalid month', monthlyAnalysisQuerySchema, { month: '2026-13' }],
    ['impossible week date', monthlyAnalysisQuerySchema, { month: '2026-09', week: '2026-02-30' }],
    ['short year', annualAnalysisQuerySchema, { year: '26' }],
    ['malformed year', annualAnalysisQuerySchema, { year: '20x6' }],
    ['month outside selected year', budgetBreakdownQuerySchema, { year: '2026', month: '2025-09' }],
  ])('rejects %s', (_label, schema, value) => {
    expect(() => schema.parse(value)).toThrow();
  });
});
