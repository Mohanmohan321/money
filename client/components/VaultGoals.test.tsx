// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Vault } from '../../shared/contracts';
import { api } from '../api';
import { VaultGoals } from './VaultGoals';

const general: Vault = {
  id: 'general',
  name: 'General Savings',
  emoji: '💰',
  isGeneral: true,
  targetAmount: '1.00',
  status: 'active',
  savedAmount: '4500.00',
  progressPercent: '450000.00',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const trip: Vault = {
  id: 'trip',
  name: 'Trip',
  emoji: '✈️',
  isGeneral: false,
  targetAmount: '60000.00',
  targetDate: '2027-01-15',
  status: 'active',
  savedAmount: '15000.00',
  progressPercent: '25.00',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-02T08:00:00.000Z',
};

const archived: Vault = {
  ...trip,
  id: 'old-phone',
  name: 'Old phone',
  emoji: '📱',
  status: 'archived',
  savedAmount: '80000.00',
  progressPercent: '100.00',
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VaultGoals', () => {
  it('puts active goals first, keeps archived goals collapsed, and uses server progress accessibly', async () => {
    render(<VaultGoals vaults={[archived, trip, general]} onRefresh={vi.fn()} />);

    const region = screen.getByRole('region', { name: 'Vault goals' });
    const generalHeading = within(region).getByRole('heading', { name: 'General Savings' });
    const tripHeading = within(region).getByRole('heading', { name: 'Trip' });
    expect(generalHeading.compareDocumentPosition(tripHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(region).getByRole('heading', { name: 'Old phone', hidden: true })).not.toBeVisible();

    const tripCard = tripHeading.closest('article');
    expect(tripCard).not.toBeNull();
    expect(within(tripCard!).getByText('15,000.00')).toBeVisible();
    expect(within(tripCard!).getByText(/60,000\.00/)).toBeVisible();
    expect(within(tripCard!).getByText('25.00%')).toBeVisible();
    expect(within(tripCard!).getByRole('progressbar', { name: 'Trip progress' })).toHaveAttribute('value', '25.00');
    expect(within(tripCard!).getByText('15 Jan 2027')).toBeVisible();

    const generalCard = generalHeading.closest('article');
    expect(generalCard).not.toBeNull();
    expect(within(generalCard!).getByRole('button', { name: 'Add money to General Savings' })).toBeVisible();
    expect(within(generalCard!).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(generalCard!).queryByText('1.00')).not.toBeInTheDocument();
    expect(within(generalCard!).queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();

    await userEvent.setup().click(within(region).getByText('Archived Vaults (1)'));
    expect(within(region).getByRole('heading', { name: 'Old phone' })).toBeVisible();
  });

  it('waits for create success, then closes before refresh completes', async () => {
    const created = deferred<Vault>();
    const refreshed = deferred<void>();
    vi.spyOn(api, 'createVault').mockReturnValue(created.promise);
    const onRefresh = vi.fn(() => refreshed.promise);
    const user = userEvent.setup();
    render(<VaultGoals vaults={[]} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'New Vault' }));
    await user.type(screen.getByLabelText('Goal name'), 'Trip');
    await user.type(screen.getByLabelText('Goal emoji'), '✈️');
    await user.type(screen.getByLabelText('Target amount'), '60000');
    await user.type(screen.getByLabelText('Target date'), '2027-01-15');
    const createButton = screen.getByRole('button', { name: 'Create Vault' });
    fireEvent.submit(createButton.closest('form')!);
    fireEvent.submit(createButton.closest('form')!);

    expect(api.createVault).toHaveBeenCalledTimes(1);
    expect(api.createVault).toHaveBeenCalledWith({
      name: 'Trip', emoji: '✈️', targetAmount: '60000', targetDate: '2027-01-15',
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Creating Vault…' })).toBeDisabled();

    await act(async () => created.resolve(trip));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('form', { name: 'Create Vault' })).not.toBeInTheDocument();

    await act(async () => refreshed.resolve());
    expect(screen.queryByRole('form', { name: 'Create Vault' })).not.toBeInTheDocument();
  });

  it('keeps create input and shows the exact API error when creation fails', async () => {
    vi.spyOn(api, 'createVault').mockRejectedValue(new Error('Target amount must be positive'));
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<VaultGoals vaults={[]} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'New Vault' }));
    await user.type(screen.getByLabelText('Goal name'), 'Trip');
    await user.type(screen.getByLabelText('Goal emoji'), '✈️');
    await user.type(screen.getByLabelText('Target amount'), '0');
    await user.click(screen.getByRole('button', { name: 'Create Vault' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Target amount must be positive');
    expect(screen.getByLabelText('Goal name')).toHaveValue('Trip');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('contributes, refreshes through the contribution callback, and locks only that action', async () => {
    const contribution = deferred<Awaited<ReturnType<typeof api.contributeToVault>>>();
    vi.spyOn(api, 'contributeToVault').mockReturnValue(contribution.promise);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onContributionRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <VaultGoals
        vaults={[general, trip]}
        onRefresh={onRefresh}
        onContributionRefresh={onContributionRefresh}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add money to Trip' }));
    await user.type(screen.getByLabelText('Contribution for Trip'), '5000');
    const submit = screen.getByRole('button', { name: 'Add to Trip' });
    fireEvent.submit(submit.closest('form')!);
    fireEvent.submit(submit.closest('form')!);

    expect(api.contributeToVault).toHaveBeenCalledTimes(1);
    expect(api.contributeToVault).toHaveBeenCalledWith('trip', { amount: '5000' });
    expect(screen.getByRole('button', { name: 'Adding to Trip…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add money to General Savings' })).toBeEnabled();
    expect(onContributionRefresh).not.toHaveBeenCalled();

    await act(async () => contribution.resolve({
      id: 'contribution', vaultId: 'trip', amount: '5000.00', createdAt: '2026-09-04T08:00:00.000Z',
    }));
    await waitFor(() => expect(onContributionRefresh).toHaveBeenCalledTimes(1));
    expect(onRefresh).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('Contribution for Trip')).not.toBeInTheDocument());
  });

  it('closes a completed contribution and reports stale data when refresh fails', async () => {
    const contribute = vi.spyOn(api, 'contributeToVault').mockResolvedValue({
      id: 'contribution', vaultId: 'trip', amount: '5000.00', createdAt: '2026-09-04T08:00:00.000Z',
    });
    const onContributionRefresh = vi.fn().mockRejectedValue(new Error('refresh offline'));
    const user = userEvent.setup();
    render(<VaultGoals vaults={[trip]} onRefresh={vi.fn()} onContributionRefresh={onContributionRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Add money to Trip' }));
    await user.type(screen.getByLabelText('Contribution for Trip'), '5000');
    await user.click(screen.getByRole('button', { name: 'Add to Trip' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/added successfully.*refresh failed.*refresh/i);
    expect(screen.queryByLabelText('Contribution for Trip')).not.toBeInTheDocument();
    expect(contribute).toHaveBeenCalledOnce();
  });

  it('updates General Savings without exposing canonical identity fields and never offers archive', async () => {
    vi.spyOn(api, 'updateVault').mockResolvedValue({ ...general, targetAmount: '10000.00' });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<VaultGoals vaults={[general]} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Edit General Savings' }));
    expect(screen.queryByLabelText('Goal name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Goal emoji')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Target amount for General Savings'));
    await user.type(screen.getByLabelText('Target amount for General Savings'), '10000');
    await user.click(screen.getByRole('button', { name: 'Save General Savings' }));

    expect(api.updateVault).toHaveBeenCalledWith('general', {
      name: 'General Savings', emoji: '💰', targetAmount: '10000',
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('archives a user Vault after API success and surfaces an archive error in that card', async () => {
    vi.spyOn(api, 'archiveVault')
      .mockRejectedValueOnce(new Error('Vault not found'))
      .mockResolvedValueOnce({ ...trip, status: 'archived' });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<VaultGoals vaults={[trip]} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Archive Trip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vault not found');
    expect(onRefresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Archive Trip' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });
});
