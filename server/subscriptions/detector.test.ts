import { describe, expect, it } from 'vitest';

import type { TransactionRecord } from '../../shared/contracts';
import { detectSubscriptions, normalizeMerchant } from './detector';

const now = new Date('2026-09-04T00:00:00.000Z');
function tx(description: string, amount: string, createdAt: string, id = createdAt): TransactionRecord {
  return { id, description, amount, createdAt, category: 'entertainment' };
}

describe('subscription detector', () => {
  it('normalizes Unicode, punctuation, transaction tokens, and order numbers', () => {
    expect(normalizeMerchant('ＮＥＴＦＬＩＸ Payment, Order #849201 CARD')).toBe('netflix');
    expect(normalizeMerchant('One Two Three Four Five')).toBe('one two three four');
  });

  it('detects a monthly subscription with a small price change and exact even median', () => {
    expect(detectSubscriptions([
      tx('Netflix payment', '649.00', '2026-07-02T10:00:00.000Z', 'one'),
      tx('NETFLIX 849201', '699.00', '2026-08-01T10:00:00.000Z', 'two'),
    ], now, 'Asia/Kolkata')[0]).toEqual(expect.objectContaining({
      merchantKey: 'netflix', merchant: 'Netflix', cadence: 'monthly', category: 'entertainment',
      typicalAmount: '674.00', monthlyEquivalent: '674.00', annualCost: '8088.00',
      nextExpectedAt: '2026-09-01T10:00:00.000Z', confidence: 'medium',
      supportingTransactionIds: ['one', 'two'],
    }));
  });

  it('detects weekly cadence and gives three occurrences high confidence', () => {
    const [candidate] = detectSubscriptions([
      tx('Gym UPI', '100.00', '2026-08-01T00:00:00.000Z', 'one'),
      tx('gym paid', '109.00', '2026-08-08T00:00:00.000Z', 'two'),
      tx('GYM purchase', '100.00', '2026-08-15T00:00:00.000Z', 'three'),
    ], now);
    expect(candidate).toEqual(expect.objectContaining({
      cadence: 'weekly', typicalAmount: '100.00', monthlyEquivalent: '433.33',
      annualCost: '5200.00', confidence: 'high', nextExpectedAt: '2026-08-22T00:00:00.000Z',
    }));
  });

  it('rejects amount drift, invalid cadence gaps, duplicate one-offs, zero and future entries', () => {
    expect(detectSubscriptions([
      tx('Service', '100.00', '2026-06-01T00:00:00.000Z'),
      tx('Service', '150.00', '2026-07-01T00:00:00.000Z'),
    ], now)).toEqual([]);
    expect(detectSubscriptions([
      tx('Service', '100.00', '2026-06-01T00:00:00.000Z'),
      tx('Service', '100.00', '2026-07-20T00:00:00.000Z'),
    ], now)).toEqual([]);
    expect(detectSubscriptions([
      tx('Service', '100.00', '2026-06-01T00:00:00.000Z', 'a'),
      tx('Service', '100.00', '2026-06-01T00:00:00.000Z', 'b'),
      tx('Service', '100.00', '2027-06-01T00:00:00.000Z', 'c'),
    ], now)).toEqual([]);
  });

  it('preserves Decimal precision at the database boundary', () => {
    const [candidate] = detectSubscriptions([
      tx('Cloud', '999999999999999999.98', '2026-07-01T00:00:00.000Z'),
      tx('Cloud', '999999999999999999.99', '2026-08-01T00:00:00.000Z'),
    ], now);
    expect(candidate.typicalAmount).toBe('999999999999999999.99');
    expect(candidate.annualCost).toBe('11999999999999999999.88');
  });
});
