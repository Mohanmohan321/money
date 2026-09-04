import Decimal from 'decimal.js';
import { DateTime } from 'luxon';

import type { SpendingCategory, TransactionRecord } from '../../shared/contracts';

export type SubscriptionCadence = 'weekly' | 'monthly';
export interface DetectedSubscription {
  merchantKey: string;
  merchant: string;
  category: SpendingCategory;
  typicalAmount: string;
  cadence: SubscriptionCadence;
  nextExpectedAt: string;
  monthlyEquivalent: string;
  annualCost: string;
  confidence: 'medium' | 'high';
  supportingTransactionIds: string[];
}

const removableTokens = new Set(['payment', 'paid', 'purchase', 'order', 'upi', 'card', 'txn']);

export function normalizeMerchant(description: string): string {
  return description.normalize('NFKC').toLowerCase()
    .replace(/[\p{P}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && !removableTokens.has(token))
    .slice(0, 4)
    .join(' ');
}

function titleCase(value: string): string {
  return value.replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

function median(values: Decimal[], MoneyDecimal: typeof Decimal): Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : sorted[middle - 1].plus(sorted[middle]).div(new MoneyDecimal(2));
}

function matchingCadence(dates: DateTime[]): SubscriptionCadence | undefined {
  const gaps = dates.slice(1).map((date, index) => date.diff(dates[index], 'days').days);
  if (gaps.every((gap) => gap >= 5 && gap <= 9)) return 'weekly';
  if (gaps.every((gap) => gap >= 25 && gap <= 35)) return 'monthly';
  return undefined;
}

export function detectSubscriptions(
  records: TransactionRecord[],
  now: Date,
  timezone = 'UTC',
): DetectedSubscription[] {
  const groups = new Map<string, TransactionRecord[]>();
  for (const record of records) {
    if (new Date(record.createdAt) > now) continue;
    const key = normalizeMerchant(record.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const candidates: DetectedSubscription[] = [];
  for (const [merchantKey, entries] of groups) {
    if (entries.length < 2) continue;
    const ordered = [...entries].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const dates = ordered.map((entry) => DateTime.fromISO(entry.createdAt, { zone: 'utc' }).setZone(timezone));
    if (dates.some((date) => !date.isValid)) continue;
    const cadence = matchingCadence(dates);
    if (!cadence) continue;
    const widest = Math.max(...ordered.map((entry) => entry.amount.replace('.', '').length));
    const MoneyDecimal = Decimal.clone({ precision: Math.max(40, widest + 16) });
    const amounts = ordered.map((entry) => new MoneyDecimal(entry.amount));
    const middle = median(amounts, MoneyDecimal);
    if (!middle.isPositive() || amounts.some((amount) => amount.minus(middle).abs().div(middle).gt('0.10'))) continue;
    const typicalAmount = middle.toDecimalPlaces(2).toFixed(2);
    const representative = new MoneyDecimal(typicalAmount);
    const monthlyEquivalent = cadence === 'weekly'
      ? representative.mul(52).div(12).toFixed(2)
      : typicalAmount;
    const annualCost = cadence === 'weekly'
      ? representative.mul(52).toFixed(2)
      : representative.mul(12).toFixed(2);
    const latest = dates.at(-1)!;
    const next = cadence === 'weekly' ? latest.plus({ days: 7 }) : latest.plus({ months: 1 });
    candidates.push({
      merchantKey,
      merchant: titleCase(merchantKey),
      category: ordered.at(-1)!.category,
      typicalAmount,
      cadence,
      nextExpectedAt: next.toUTC().toISO()!,
      monthlyEquivalent,
      annualCost,
      confidence: ordered.length >= 3 ? 'high' : 'medium',
      supportingTransactionIds: ordered.map((entry) => entry.id),
    });
  }
  return candidates.sort((left, right) => left.merchantKey.localeCompare(right.merchantKey));
}
