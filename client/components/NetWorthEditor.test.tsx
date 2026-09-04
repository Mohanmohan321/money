// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssetRecord, LiabilityRecord } from '../../shared/contracts';
import { api } from '../api';
import { NetWorthEditor } from './NetWorthEditor';

const asset: AssetRecord = {
  id: 'asset-1',
  name: 'Savings account',
  type: 'bank',
  currentValue: '125000.00',
  note: 'Emergency cash',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-02T08:00:00.000Z',
};

const liability: LiabilityRecord = {
  id: 'liability-1',
  name: 'Home loan',
  type: 'mortgage',
  outstandingBalance: '750000.00',
  note: 'Fixed rate',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-02T08:00:00.000Z',
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

describe('NetWorthEditor', () => {
  it('creates a bank asset only once, resets after API success, and then refreshes', async () => {
    const created = deferred<AssetRecord>();
    const refreshed = deferred<void>();
    vi.spyOn(api, 'createAsset').mockReturnValue(created.promise);
    const onRefresh = vi.fn(() => refreshed.promise);
    const user = userEvent.setup();
    render(<NetWorthEditor assets={[]} liabilities={[]} onRefresh={onRefresh} />);

    await user.type(screen.getByLabelText('Asset name'), 'Savings account');
    await user.selectOptions(screen.getByLabelText('Asset type'), 'bank');
    await user.type(screen.getByLabelText('Current value'), '125000');
    await user.type(screen.getByLabelText('Asset note (optional)'), 'Emergency cash');
    const add = screen.getByRole('button', { name: 'Add asset' });
    fireEvent.submit(add.closest('form')!);
    fireEvent.submit(add.closest('form')!);

    expect(api.createAsset).toHaveBeenCalledTimes(1);
    expect(api.createAsset).toHaveBeenCalledWith({
      name: 'Savings account', type: 'bank', currentValue: '125000', note: 'Emergency cash',
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Adding asset…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add liability' })).toBeEnabled();

    await act(async () => created.resolve(asset));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Asset name')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Savings account' })).toBeVisible();

    await act(async () => refreshed.resolve());
    expect(screen.getByLabelText('Asset name')).toHaveValue('');
    expect(screen.getByLabelText('Asset type')).toHaveValue('cash');
    expect(screen.getByRole('heading', { name: 'Savings account' })).toBeVisible();
  });

  it('creates a liability using the exact server enum and balance field', async () => {
    vi.spyOn(api, 'createLiability').mockResolvedValue(liability);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<NetWorthEditor assets={[]} liabilities={[]} onRefresh={onRefresh} />);

    await user.type(screen.getByLabelText('Liability name'), 'Home loan');
    await user.selectOptions(screen.getByLabelText('Liability type'), 'mortgage');
    await user.type(screen.getByLabelText('Outstanding balance'), '750000');
    await user.type(screen.getByLabelText('Liability note (optional)'), 'Fixed rate');
    await user.click(screen.getByRole('button', { name: 'Add liability' }));

    expect(api.createLiability).toHaveBeenCalledWith({
      name: 'Home loan', type: 'mortgage', outstandingBalance: '750000', note: 'Fixed rate',
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Liability name')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Home loan' })).toBeVisible();
  });

  it('clears successful asset and liability creates even when refresh fails', async () => {
    const createAsset = vi.spyOn(api, 'createAsset').mockResolvedValue(asset);
    const createLiability = vi.spyOn(api, 'createLiability').mockResolvedValue(liability);
    const onRefresh = vi.fn().mockRejectedValue(new Error('refresh offline'));
    const user = userEvent.setup();
    render(<NetWorthEditor assets={[]} liabilities={[]} onRefresh={onRefresh} />);

    await user.type(screen.getByLabelText('Asset name'), 'Savings account');
    await user.type(screen.getByLabelText('Current value'), '125000');
    await user.click(screen.getByRole('button', { name: 'Add asset' }));
    expect(await screen.findByRole('heading', { name: 'Savings account' })).toBeVisible();
    expect(screen.getByLabelText('Asset name')).toHaveValue('');

    await user.type(screen.getByLabelText('Liability name'), 'Home loan');
    await user.type(screen.getByLabelText('Outstanding balance'), '750000');
    await user.click(screen.getByRole('button', { name: 'Add liability' }));

    expect(await screen.findByRole('heading', { name: 'Home loan' })).toBeVisible();
    expect(screen.getByLabelText('Liability name')).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent(/saved successfully.*refresh failed.*refresh/i);
    expect(createAsset).toHaveBeenCalledOnce();
    expect(createLiability).toHaveBeenCalledOnce();
  });

  it('updates separate asset and liability records and keeps server values intact', async () => {
    vi.spyOn(api, 'updateAsset').mockResolvedValue({ ...asset, currentValue: '130000.00' });
    vi.spyOn(api, 'updateLiability').mockResolvedValue({ ...liability, type: 'loan', outstandingBalance: '700000.00' });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<NetWorthEditor assets={[asset]} liabilities={[liability]} onRefresh={onRefresh} />);

    const assetRow = screen.getByRole('article', { name: 'Asset Savings account' });
    expect(within(assetRow).getByText('Bank')).toBeVisible();
    expect(within(assetRow).getByText(/(?:1,25,000|125,000)\.00/)).toBeVisible();
    await user.click(within(assetRow).getByRole('button', { name: 'Edit asset Savings account' }));
    await user.clear(screen.getByLabelText('Current value for Savings account'));
    await user.type(screen.getByLabelText('Current value for Savings account'), '130000');
    await user.click(screen.getByRole('button', { name: 'Save asset Savings account' }));
    expect(api.updateAsset).toHaveBeenCalledWith('asset-1', {
      name: 'Savings account', type: 'bank', currentValue: '130000', note: 'Emergency cash',
    });

    const liabilityRow = screen.getByRole('article', { name: 'Liability Home loan' });
    expect(within(liabilityRow).getByText('Mortgage')).toBeVisible();
    expect(within(liabilityRow).getByText(/(?:7,50,000|750,000)\.00/)).toBeVisible();
    await user.click(within(liabilityRow).getByRole('button', { name: 'Edit liability Home loan' }));
    await user.selectOptions(screen.getByLabelText('Liability type for Home loan'), 'loan');
    await user.clear(screen.getByLabelText('Outstanding balance for Home loan'));
    await user.type(screen.getByLabelText('Outstanding balance for Home loan'), '700000');
    await user.click(screen.getByRole('button', { name: 'Save liability Home loan' }));
    expect(api.updateLiability).toHaveBeenCalledWith('liability-1', {
      name: 'Home loan', type: 'loan', outstandingBalance: '700000', note: 'Fixed rate',
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('cancels deletion without a request, then deletes and refreshes after confirmation', async () => {
    vi.spyOn(api, 'deleteAsset').mockResolvedValue({ deleted: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<NetWorthEditor assets={[asset]} liabilities={[]} onRefresh={onRefresh} />);

    const remove = screen.getByRole('button', { name: 'Delete asset Savings account' });
    await user.click(remove);
    expect(confirm).toHaveBeenCalledWith('Delete asset "Savings account"? This cannot be undone.');
    expect(api.deleteAsset).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();

    await user.click(remove);
    expect(api.deleteAsset).toHaveBeenCalledWith('asset-1');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Savings account' })).not.toBeInTheDocument());
  });

  it('surfaces an exact per-action API error without clearing form state', async () => {
    vi.spyOn(api, 'createAsset').mockRejectedValue(new Error('Current value must be positive'));
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<NetWorthEditor assets={[]} liabilities={[]} onRefresh={onRefresh} />);

    await user.type(screen.getByLabelText('Asset name'), 'Cash');
    await user.type(screen.getByLabelText('Current value'), '0');
    await user.click(screen.getByRole('button', { name: 'Add asset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Current value must be positive');
    expect(screen.getByLabelText('Asset name')).toHaveValue('Cash');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('contains only manual assets and liabilities, never receivables or borrowed debt', () => {
    render(<NetWorthEditor assets={[]} liabilities={[]} onRefresh={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Assets' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Liabilities' })).toBeVisible();
    expect(screen.queryByText('Receivables')).not.toBeInTheDocument();
    expect(screen.queryByText('Borrowed debt')).not.toBeInTheDocument();
  });
});
