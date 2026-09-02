import { describe, expect, it } from 'vitest';

import { dashboardRanges, localDateRange } from './time';

describe('localDateRange', () => {
  it('converts an Asia/Kolkata calendar day to half-open UTC boundaries', () => {
    const range = localDateRange('2026-09-02', '2026-09-02', 'Asia/Kolkata');

    expect(range.from.toISOString()).toBe('2026-09-01T18:30:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-09-02T18:30:00.000Z');
  });

  it('rejects impossible dates instead of allowing rollover', () => {
    expect(() => localDateRange('2026-02-30', undefined, 'Asia/Kolkata')).toThrow(
      'Invalid `from` date',
    );
  });
});

describe('dashboardRanges', () => {
  it('uses Monday as the week start and local calendar month boundaries', () => {
    const ranges = dashboardRanges(
      new Date('2026-09-02T20:00:00.000Z'),
      'Asia/Kolkata',
    );

    expect(ranges.today.from.toISOString()).toBe('2026-09-02T18:30:00.000Z');
    expect(ranges.today.toExclusive.toISOString()).toBe('2026-09-03T18:30:00.000Z');
    expect(ranges.week.from.toISOString()).toBe('2026-08-30T18:30:00.000Z');
    expect(ranges.week.toExclusive.toISOString()).toBe('2026-09-06T18:30:00.000Z');
    expect(ranges.month.from.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(ranges.month.toExclusive.toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });
});
