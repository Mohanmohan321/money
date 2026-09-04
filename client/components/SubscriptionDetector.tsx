import { useRef, useState } from 'react';

import type { SubscriptionCandidateList } from '../../shared/contracts';
import { api } from '../api';
import { formatMoney } from '../format';
import { CategoryBadge } from './CategoryBadge';

interface SubscriptionDetectorProps {
  data?: SubscriptionCandidateList;
  actualSpending: string;
  error?: string;
  onRefresh: () => void | Promise<void>;
}

function formatExpectedDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
}

export function SubscriptionDetector({ data, actualSpending, error, onRefresh }: SubscriptionDetectorProps) {
  const [reviewingKey, setReviewingKey] = useState('');
  const [reviewError, setReviewError] = useState('');
  const mutationLocked = useRef(false);

  async function review(merchantKey: string, status: 'confirmed' | 'dismissed') {
    if (mutationLocked.current) return;
    mutationLocked.current = true;
    setReviewingKey(merchantKey);
    setReviewError('');
    try {
      await api.reviewSubscription(merchantKey, status);
      await onRefresh();
    } catch {
      setReviewError('This subscription could not be reviewed. Check your connection and try again.');
    } finally {
      mutationLocked.current = false;
      setReviewingKey('');
    }
  }

  return (
    <section className="subscription-detector insight-panel" aria-labelledby="subscriptions-title">
      <div className="section-heading">
        <div><p className="eyebrow">Reviewable forecast</p><h2 id="subscriptions-title">Subscriptions</h2></div>
      </div>
      <div className="subscription-totals">
        <p><span>Projected subscriptions</span><strong>{formatMoney(data?.confirmedMonthlyForecast ?? '0.00')}</strong></p>
        <p><span>Actual monthly spending</span><strong>{formatMoney(actualSpending)}</strong></p>
      </div>
      <p className="subscription-disclaimer">Projected subscriptions are forecasts and are not included in actual spending.</p>
      {(error || reviewError) && <p className="form-error" role="alert">{reviewError || error}</p>}
      {!data && !error && <p className="compact-empty">Checking recurring payments…</p>}
      {data && data.items.length === 0 && <p className="compact-empty">No recurring payments detected yet.</p>}
      {data?.items.map((candidate) => {
        const busy = reviewingKey === candidate.merchantKey;
        return (
          <article className={`subscription-card ${candidate.reviewStatus}`} key={candidate.merchantKey}>
            <div className="subscription-card-heading">
              <div><h3>{candidate.merchant}</h3><CategoryBadge category={candidate.category} /></div>
              <span className="confidence-label">{candidate.confidence} confidence</span>
            </div>
            <dl className="subscription-metrics">
              <div><dt>Typical payment</dt><dd>{formatMoney(candidate.typicalAmount)}</dd></div>
              <div><dt>Cadence</dt><dd>{candidate.cadence}</dd></div>
              <div><dt>Next expected</dt><dd>{formatExpectedDate(candidate.nextExpectedAt)}</dd></div>
            </dl>
            <p>{formatMoney(candidate.monthlyEquivalent)} monthly · {formatMoney(candidate.annualCost)} annually</p>
            <details>
              <summary>Supporting transactions</summary>
              <ul>{candidate.supportingTransactionIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
            </details>
            <div className="subscription-actions">
              {candidate.reviewStatus === 'pending' ? (
                <>
                  <button className="primary-button" type="button" disabled={Boolean(reviewingKey)} aria-label={`Confirm ${candidate.merchant} subscription`} onClick={() => void review(candidate.merchantKey, 'confirmed')}>{busy ? 'Saving…' : 'Confirm'}</button>
                  <button className="secondary-button" type="button" disabled={Boolean(reviewingKey)} aria-label={`Dismiss ${candidate.merchant} subscription`} onClick={() => void review(candidate.merchantKey, 'dismissed')}>Not a subscription</button>
                </>
              ) : (
                <>
                  <span className="confirmed-label">Confirmed</span>
                  <button className="secondary-button" type="button" disabled={Boolean(reviewingKey)} aria-label={`Dismiss ${candidate.merchant} subscription`} onClick={() => void review(candidate.merchantKey, 'dismissed')}>{busy ? 'Saving…' : 'Dismiss'}</button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
