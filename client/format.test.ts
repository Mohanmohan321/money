import { describe, expect, it } from 'vitest';

import { formatMoney, formatMonth } from './format';

describe('display formatters', () => {
  it('formats signed decimal strings to two places', () => {
    expect(formatMoney('-1234.50', 'en-US')).toBe('-1,234.50');
    expect(formatMoney('+1234.5', 'en-US')).toBe('+1,234.50');
  });

  it('preserves integers beyond Number safe precision', () => {
    expect(formatMoney('900719925474099312345678901234.50', 'en-US'))
      .toBe('900,719,925,474,099,312,345,678,901,234.50');
  });

  it('uses locale grouping without changing the decimal string', () => {
    expect(formatMoney('1234567890123456789.05', 'en-IN'))
      .toBe('12,34,56,78,90,12,34,56,789.05');
    expect(formatMoney('1234.50', 'de-DE')).toBe('1.234,50');
  });

  it('rejects values outside the decimal-string display contract', () => {
    expect(() => formatMoney('1e6', 'en-US')).toThrow('decimal string');
    expect(() => formatMoney('12.345', 'en-US')).toThrow('at most two decimal places');
  });

  it('formats a validated month in the requested locale', () => {
    expect(formatMonth('2026-09', 'en-IN')).toBe('September 2026');
    expect(() => formatMonth('2026-13', 'en-IN')).toThrow('YYYY-MM');
  });
});
