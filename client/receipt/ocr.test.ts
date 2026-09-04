import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWorkerMock } = vi.hoisted(() => ({ createWorkerMock: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: createWorkerMock }));

import { recognizeReceipt, validateReceiptImage } from './ocr';

describe('receipt OCR adapter', () => {
  beforeEach(() => createWorkerMock.mockReset());

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts a non-empty %s image', (type) => {
    expect(validateReceiptImage(new File(['image'], 'receipt', { type }))).toBeUndefined();
  });

  it('rejects empty, unsupported, and oversized images', () => {
    expect(validateReceiptImage(new File([], 'empty.png', { type: 'image/png' }))).toMatch(/empty/i);
    expect(validateReceiptImage(new File(['x'], 'receipt.gif', { type: 'image/gif' }))).toMatch(/JPEG, PNG, or WebP/i);
    expect(validateReceiptImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).toMatch(/10 MiB/i);
  });

  it('recognizes one image, reports progress, and terminates the worker', async () => {
    const worker = {
      recognize: vi.fn().mockResolvedValue({ data: { text: 'SWIGGY\nTOTAL 100.00', confidence: 93 } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    createWorkerMock.mockImplementation(async (...args: unknown[]) => {
      if (args.length === 0) return worker;
      const options = args[2] as { logger: (message: { status: string; progress: number }) => void };
      options.logger({ status: 'loading language', progress: 0.2 });
      options.logger({ status: 'recognizing text', progress: 0.65 });
      return worker;
    });
    const onProgress = vi.fn();
    const file = new File(['image'], 'receipt.png', { type: 'image/png' });

    await expect(recognizeReceipt(file, onProgress)).resolves.toEqual({
      text: 'SWIGGY\nTOTAL 100.00', confidence: 93,
    });
    expect(createWorkerMock).toHaveBeenCalledWith('eng', undefined, expect.objectContaining({ logger: expect.any(Function) }));
    expect(onProgress).toHaveBeenCalledWith(0.65);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates after recognition rejects but not when worker creation rejects', async () => {
    const worker = {
      recognize: vi.fn().mockRejectedValue(new Error('recognition failed')),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    createWorkerMock.mockResolvedValueOnce(worker);
    const file = new File(['image'], 'receipt.png', { type: 'image/png' });
    await expect(recognizeReceipt(file, vi.fn())).rejects.toThrow('recognition failed');
    expect(worker.terminate).toHaveBeenCalledOnce();

    createWorkerMock.mockRejectedValueOnce(new Error('worker failed'));
    await expect(recognizeReceipt(file, vi.fn())).rejects.toThrow('worker failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
