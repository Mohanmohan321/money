import { describe, expect, it } from 'vitest';

import {
  createPersonRecordSchema,
  createTransactionSchema,
  moneySchema,
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
