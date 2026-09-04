import { categorizeTransaction } from '../../shared/budgeting';
import { moneySchema, type SpendingCategory } from '../../shared/contracts';

export interface ReceiptCandidate {
  merchant: string;
  amount?: string;
  category: SpendingCategory;
  confidence: 'high' | 'low';
}

const ignoredMerchant = /^(?:receipt|invoice|tax invoice|order|tel|phone|gstin)\b/i;
const totalLabels = [
  /\bgrand\s+total\b/i,
  /\bamount\s+due\b/i,
  /\btotal\s+paid\b/i,
  /(?:^|\s)total(?:\s|:|$)/i,
];
const amountPattern = /(?<![-\d.])(?:Rs\.?|INR|₹|\$|€|£)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d.])/gi;
const fallbackPattern = /(?<![-\d.])(?:(?:Rs\.?|INR|₹|\$|€|£)\s*\d+(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:,\d{3})*\.\d{2})(?![\d.])/gi;

function digitShare(line: string): number {
  const compact = line.replace(/\s/g, '');
  if (!compact) return 1;
  return (compact.match(/\d/g)?.length ?? 0) / compact.length;
}

function lastValidAmount(line: string, pattern: RegExp): string | undefined {
  if (/\b(?:refund|refunded|return)\b/i.test(line)) return undefined;
  const matches = [...line.matchAll(pattern)];
  for (const match of matches.reverse()) {
    const raw = (match[1] ?? match[0]).replace(/,/g, '').trim();
    const parsed = moneySchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

export function parseReceiptText(text: string): ReceiptCandidate {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const merchant = lines.find((line) => !ignoredMerchant.test(line) && digitShare(line) <= 0.5 && /[\p{L}]/u.test(line)) ?? '';

  for (const label of totalLabels) {
    const matchingLines = lines.filter((line) => label.test(line));
    for (const line of matchingLines.reverse()) {
      const amount = lastValidAmount(line, amountPattern);
      if (amount) return { merchant, amount, category: categorizeTransaction(merchant), confidence: 'high' };
    }
    if (matchingLines.length > 0) {
      return { merchant, category: categorizeTransaction(merchant), confidence: 'low' };
    }
  }

  const amounts = lines.flatMap((line) => {
    if (/\b(?:refund|refunded|return)\b/i.test(line)) return [];
    const amount = lastValidAmount(line, fallbackPattern);
    return amount ? [amount] : [];
  });
  const amount = amounts.sort((left, right) => {
    const [li, lf] = left.split('.');
    const [ri, rf] = right.split('.');
    return Number(BigInt(`${li}${lf}`) - BigInt(`${ri}${rf}`));
  }).at(-1);
  return { merchant, ...(amount ? { amount } : {}), category: categorizeTransaction(merchant), confidence: 'low' };
}
