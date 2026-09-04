// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubscriptionCandidateList } from '../../shared/contracts';
import { api } from '../api';
import { SubscriptionDetector } from './SubscriptionDetector';

const data: SubscriptionCandidateList = {
  confirmedMonthlyForecast: '674.00',
  items: [{
    merchantKey: 'netflix', merchant: 'Netflix', category: 'entertainment', typicalAmount: '674.00',
    cadence: 'monthly', nextExpectedAt: '2026-09-01T10:00:00.000Z', monthlyEquivalent: '674.00',
    annualCost: '8088.00', confidence: 'medium', supportingTransactionIds: ['one', 'two'],
    reviewStatus: 'confirmed',
  }],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SubscriptionDetector', () => {
  it('shows confirmed forecast separately from actual and allows dismissal', async () => {
    const review = vi.spyOn(api, 'reviewSubscription').mockResolvedValue({ ...data.items[0], reviewStatus: 'dismissed' });
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionDetector data={data} actualSpending="12000.00" onRefresh={onRefresh} />);
    expect(screen.getByText('Projected subscriptions').parentElement).toHaveTextContent('674.00');
    expect(screen.getByText('Actual monthly spending').parentElement).toHaveTextContent('12,000.00');
    expect(screen.getByText(/not included in actual spending/i)).toBeVisible();
    expect(screen.getByText('Entertainment')).toBeVisible();
    expect(screen.getByText(/8,088.00 annually/)).toBeVisible();
    expect(screen.getByText(/1 Sept? 2026/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss Netflix subscription' }));
    expect(review).toHaveBeenCalledWith('netflix', 'dismissed');
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('confirms a pending candidate and discloses supporting transaction IDs', async () => {
    const pending = { ...data, confirmedMonthlyForecast: '0.00', items: [{ ...data.items[0], reviewStatus: 'pending' as const }] };
    const review = vi.spyOn(api, 'reviewSubscription').mockResolvedValue({ ...pending.items[0], reviewStatus: 'confirmed' });
    const user = userEvent.setup();
    render(<SubscriptionDetector data={pending} actualSpending="12000.00" onRefresh={vi.fn()} />);
    await user.click(screen.getByText('Supporting transactions'));
    expect(screen.getByText('one')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm Netflix subscription' }));
    expect(review).toHaveBeenCalledWith('netflix', 'confirmed');
  });

  it('locks review mutations in the same tick and recovers from an API error', async () => {
    let reject!: (error: Error) => void;
    const review = vi.spyOn(api, 'reviewSubscription').mockReturnValue(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const user = userEvent.setup();
    const pending = { ...data, items: [{ ...data.items[0], reviewStatus: 'pending' as const }] };
    render(<SubscriptionDetector data={pending} actualSpending="1.00" onRefresh={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Confirm Netflix subscription' });
    button.click(); button.click();
    expect(review).toHaveBeenCalledOnce();
    await waitFor(() => expect(button).toBeDisabled());
    reject(new Error('offline'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be reviewed/i);
    expect(button).toBeEnabled();
  });

  it('shows explicit loading, error, and empty states', () => {
    const view = render(<SubscriptionDetector actualSpending="0.00" onRefresh={vi.fn()} />);
    expect(screen.getByText(/checking recurring payments/i)).toBeVisible();
    view.rerender(<SubscriptionDetector error="Subscriptions unavailable" actualSpending="0.00" onRefresh={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Subscriptions unavailable');
    view.rerender(<SubscriptionDetector data={{ items: [], confirmedMonthlyForecast: '0.00' }} actualSpending="0.00" onRefresh={vi.fn()} />);
    expect(screen.getByText(/no recurring payments detected/i)).toBeVisible();
  });
});
