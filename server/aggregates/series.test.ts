import { describe, expect, it } from 'vitest';

import { fillDailySeries } from './drizzle-aggregate-store';

describe('fillDailySeries', () => {
  it('fills missing local dates with decimal-string zeroes', () => {
    expect(
      fillDailySeries(
        new Date('2026-08-31T18:30:00.000Z'),
        new Date('2026-09-03T18:30:00.000Z'),
        'Asia/Kolkata',
        [{
          date: '2026-09-02',
          transactionAmount: '10.10',
          lentAmount: '0.00',
          borrowedAmount: '2.25',
        }],
      ),
    ).toEqual([
      { date: '2026-09-01', transactionAmount: '0.00', lentAmount: '0.00', borrowedAmount: '0.00' },
      { date: '2026-09-02', transactionAmount: '10.10', lentAmount: '0.00', borrowedAmount: '2.25' },
      { date: '2026-09-03', transactionAmount: '0.00', lentAmount: '0.00', borrowedAmount: '0.00' },
    ]);
  });
});
