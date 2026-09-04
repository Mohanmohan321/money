import { describe, expect, it } from 'vitest';

import { parseReceiptText } from './parser';

describe('parseReceiptText', () => {
  it('extracts merchant, labeled grand total, and category', () => {
    expect(parseReceiptText('SWIGGY\nOrder 8472\nSubtotal 420.00\nTax 21.00\nGRAND TOTAL ₹441.00')).toEqual({
      merchant: 'SWIGGY', amount: '441.00', category: 'food', confidence: 'high',
    });
  });

  it('prefers amount due over subtotal and ignores phone and order numbers', () => {
    expect(parseReceiptText('APOLLO PHARMACY\r\nPhone 9876543210\r\nSubtotal 800.00\r\nAmount Due 845.50')).toEqual({
      merchant: 'APOLLO PHARMACY', amount: '845.50', category: 'health', confidence: 'high',
    });
  });

  it('returns an editable low-confidence result when no labeled total exists', () => {
    expect(parseReceiptText('Corner Cafe\n120.00\n135.00')).toEqual({
      merchant: 'Corner Cafe', amount: '135.00', category: 'coffee', confidence: 'low',
    });
  });

  it.each([
    ['Shop\nTOTAL Rs 1,234.50', '1234.50'],
    ['Shop\nTOTAL $42.25', '42.25'],
    ['Shop\nTOTAL €7.10', '7.10'],
  ])('normalizes currency amount from %s', (text, amount) => {
    expect(parseReceiptText(text).amount).toBe(amount);
  });

  it('does not use refunds, negative values, malformed decimals, or oversized money', () => {
    expect(parseReceiptText('Store\nRefund -500.00\nTOTAL 12.345')).toEqual({
      merchant: 'Store', category: 'other', confidence: 'low',
    });
    expect(parseReceiptText('Store\nTOTAL 9999999999999999999.99').amount).toBeUndefined();
  });

  it('returns an editable empty candidate for blank recognition', () => {
    expect(parseReceiptText(' \r\n ')).toEqual({
      merchant: '', category: 'other', confidence: 'low',
    });
  });
});
