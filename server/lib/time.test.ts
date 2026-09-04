import { describe, expect, it } from 'vitest';

import {
  dashboardRanges,
  localDateRange,
  monthRange,
  weekRangeContaining,
  yearRange,
} from './time';

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

describe('planning ranges', () => {
  it('builds Kolkata month, year, and Monday week boundaries', () => {
    expect(monthRange('2026-09', 'Asia/Kolkata')).toEqual({
      from: new Date('2026-08-31T18:30:00.000Z'),
      toExclusive: new Date('2026-09-30T18:30:00.000Z'),
    });
    expect(yearRange('2026', 'Asia/Kolkata')).toEqual({
      from: new Date('2025-12-31T18:30:00.000Z'),
      toExclusive: new Date('2026-12-31T18:30:00.000Z'),
    });
    expect(weekRangeContaining('2026-09-03', 'Asia/Kolkata')).toEqual({
      from: new Date('2026-08-30T18:30:00.000Z'),
      toExclusive: new Date('2026-09-06T18:30:00.000Z'),
    });
  });

  it('keeps half-open local calendar boundaries across daylight-saving changes', () => {
    expect(monthRange('2026-03', 'America/New_York')).toEqual({
      from: new Date('2026-03-01T05:00:00.000Z'),
      toExclusive: new Date('2026-04-01T04:00:00.000Z'),
    });
    expect(weekRangeContaining('2026-03-08', 'America/New_York')).toEqual({
      from: new Date('2026-03-02T05:00:00.000Z'),
      toExclusive: new Date('2026-03-09T04:00:00.000Z'),
    });
    expect(yearRange('2026', 'America/New_York')).toEqual({
      from: new Date('2026-01-01T05:00:00.000Z'),
      toExclusive: new Date('2027-01-01T05:00:00.000Z'),
    });
    expect(weekRangeContaining('2026-11-01', 'America/New_York')).toEqual({
      from: new Date('2026-10-26T04:00:00.000Z'),
      toExclusive: new Date('2026-11-02T05:00:00.000Z'),
    });
  });

  it.each([
    ['month', () => monthRange('2026-13', 'Asia/Kolkata')],
    ['month format', () => monthRange('2026-9', 'Asia/Kolkata')],
    ['year', () => yearRange('26', 'Asia/Kolkata')],
    ['local date', () => weekRangeContaining('2026-02-30', 'Asia/Kolkata')],
    ['timezone', () => monthRange('2026-09', 'Mars/Olympus')],
  ])('rejects an invalid %s input', (_label, buildRange) => {
    expect(buildRange).toThrow();
  });
});
