// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recognizeReceiptMock } = vi.hoisted(() => ({ recognizeReceiptMock: vi.fn() }));
vi.mock('../receipt/ocr', async (load) => ({
  ...await load<typeof import('../receipt/ocr')>(),
  recognizeReceipt: recognizeReceiptMock,
}));

import { api } from '../api';
import { SnapReceipt } from './SnapReceipt';

const receiptFile = new File(['receipt'], 'receipt.png', { type: 'image/png' });

beforeEach(() => {
  recognizeReceiptMock.mockReset();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipt-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SnapReceipt', () => {
  it('does not save spending until the editable review is confirmed', async () => {
    recognizeReceiptMock.mockImplementation(async (_file, progress) => {
      progress(0.7);
      return { text: 'SWIGGY\nGRAND TOTAL 441.00', confidence: 94 };
    });
    const create = vi.spyOn(api, 'createTransaction').mockResolvedValue({
      id: 'tx', description: 'SWIGGY', amount: '441.00', category: 'food', createdAt: new Date().toISOString(),
    });
    const onSaved = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    render(<SnapReceipt onSaved={onSaved} />);

    await user.upload(screen.getByLabelText('Receipt image'), receiptFile);
    await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
    expect(await screen.findByLabelText('Merchant')).toHaveValue('SWIGGY');
    expect(screen.getByLabelText('Amount')).toHaveValue('441.00');
    expect(create).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Merchant'));
    await user.type(screen.getByLabelText('Merchant'), 'Swiggy corrected');
    await user.click(screen.getByRole('button', { name: 'Confirm spending' }));

    expect(create).toHaveBeenCalledWith('Swiggy corrected', '441.00', 'food');
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('shows native scan progress and a low-confidence editable warning', async () => {
    let resolve!: (value: { text: string; confidence: number }) => void;
    recognizeReceiptMock.mockImplementation(async (_file, progress) => {
      progress(0.42);
      return new Promise((done) => { resolve = done; });
    });
    const user = userEvent.setup();
    render(<SnapReceipt onSaved={vi.fn()} />);
    await user.upload(screen.getByLabelText('Receipt image'), receiptFile);
    await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '42');
    expect(screen.getByRole('button', { name: 'Scanning receipt…' })).toBeDisabled();
    resolve({ text: 'Corner Cafe\n120.00\n135.00', confidence: 55 });
    expect(await screen.findByRole('alert')).toHaveTextContent(/check and correct/i);
    expect(screen.getByLabelText('Category')).toHaveValue('coffee');
  });

  it('rejects invalid files and recovers from empty OCR or save failure', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<SnapReceipt onSaved={vi.fn()} />);
    await user.upload(screen.getByLabelText('Receipt image'), new File(['x'], 'bad.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG, or WebP/i);

    recognizeReceiptMock.mockResolvedValue({ text: '  ', confidence: 0 });
    await user.upload(screen.getByLabelText('Receipt image'), receiptFile);
    await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no text/i);

    recognizeReceiptMock.mockResolvedValue({ text: 'Shop\nTOTAL 12.00', confidence: 90 });
    await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
    vi.spyOn(api, 'createTransaction').mockRejectedValue(new Error('offline'));
    await user.click(await screen.findByRole('button', { name: 'Confirm spending' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
    expect(screen.getByRole('button', { name: 'Confirm spending' })).toBeEnabled();
  });

  it('discards review and revokes previews on replacement and unmount', async () => {
    recognizeReceiptMock.mockResolvedValue({ text: 'Shop\nTOTAL 12.00', confidence: 90 });
    const user = userEvent.setup();
    const view = render(<SnapReceipt onSaved={vi.fn()} />);
    const input = screen.getByLabelText('Receipt image');
    await user.upload(input, receiptFile);
    await user.upload(input, new File(['new'], 'new.png', { type: 'image/png' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:receipt-preview');
    await user.click(screen.getByRole('button', { name: 'Scan receipt' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel receipt' }));
    expect(screen.queryByLabelText('Merchant')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan receipt' })).toBeDisabled());
    view.unmount();
  });
});
