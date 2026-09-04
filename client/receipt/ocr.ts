const supportedReceiptTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumReceiptBytes = 10 * 1024 * 1024;

export function validateReceiptImage(file: File): string | undefined {
  if (file.size === 0) return 'The receipt image is empty.';
  if (!supportedReceiptTypes.has(file.type)) return 'Choose a JPEG, PNG, or WebP receipt image.';
  if (file.size > maximumReceiptBytes) return 'Receipt images must be 10 MiB or smaller.';
  return undefined;
}

export async function recognizeReceipt(
  file: File,
  onProgress: (value: number) => void,
): Promise<{ text: string; confidence: number }> {
  const validationError = validateReceiptImage(file);
  if (validationError) throw new Error(validationError);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', undefined, {
    logger: ({ status, progress }) => {
      if (status === 'recognizing text') onProgress(progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
