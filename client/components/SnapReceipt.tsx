import { useEffect, useRef, useState } from 'react';

import { moneySchema, type SpendingCategory } from '../../shared/contracts';
import { api, ApiError } from '../api';
import { parseReceiptText } from '../receipt/parser';
import { recognizeReceipt, validateReceiptImage } from '../receipt/ocr';
import { CategoryBadge, categoryPresentation } from './CategoryBadge';

type ReceiptState = 'idle' | 'scanning' | 'review' | 'saving';
const categories = Object.keys(categoryPresentation) as SpendingCategory[];

export interface SnapReceiptProps {
  onSaved: () => void | Promise<void>;
  compact?: boolean;
}

export function SnapReceipt({ onSaved, compact = false }: SnapReceiptProps) {
  const [state, setState] = useState<ReceiptState>('idle');
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<SpendingCategory>('other');
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef('');
  const scanningRef = useRef(false);
  const savingRef = useRef(false);

  function replacePreview(next: string) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setPreviewUrl(next);
  }

  function reset() {
    replacePreview('');
    setState('idle');
    setFile(undefined);
    setProgress(0);
    setMerchant('');
    setAmount('');
    setCategory('other');
    setWarning('');
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function selectFile(next?: File) {
    setError('');
    setWarning('');
    setState('idle');
    setProgress(0);
    if (!next) {
      setFile(undefined);
      replacePreview('');
      return;
    }
    const validationError = validateReceiptImage(next);
    if (validationError) {
      setFile(undefined);
      replacePreview('');
      setError(validationError);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setFile(next);
    replacePreview(URL.createObjectURL(next));
  }

  async function scan() {
    if (!file || scanningRef.current || savingRef.current) return;
    scanningRef.current = true;
    setState('scanning');
    setProgress(0);
    setError('');
    setWarning('');
    try {
      const recognized = await recognizeReceipt(file, (value) => setProgress(Math.round(value * 100)));
      if (!recognized.text.trim()) {
        setState('idle');
        setError('No text was recognized. Try a clearer photo or enter the transaction manually.');
        return;
      }
      const candidate = parseReceiptText(recognized.text);
      setMerchant(candidate.merchant);
      setAmount(candidate.amount ?? '');
      setCategory(candidate.category);
      if (recognized.confidence < 70 || candidate.confidence === 'low' || !candidate.merchant || !candidate.amount) {
        setWarning('The scan has low confidence. Check and correct every field before confirming.');
      }
      setState('review');
    } catch (caught) {
      setState('idle');
      setError(caught instanceof Error ? caught.message : 'The receipt could not be scanned. Try again or enter it manually.');
    } finally {
      scanningRef.current = false;
    }
  }

  async function confirm() {
    if (state !== 'review' || savingRef.current) return;
    const parsedAmount = moneySchema.safeParse(amount);
    if (!merchant.trim() || merchant.trim().length > 200 || !parsedAmount.success) {
      setError(!merchant.trim() ? 'Merchant is required.' : parsedAmount.error?.issues[0]?.message ?? 'Enter a valid amount.');
      return;
    }
    savingRef.current = true;
    setState('saving');
    setError('');
    try {
      await api.createTransaction(merchant.trim(), parsedAmount.data, category);
      await onSaved();
      reset();
    } catch (caught) {
      setState('review');
      setError(caught instanceof ApiError ? caught.message : 'This receipt could not be saved. Check your connection and try again.');
    } finally {
      savingRef.current = false;
    }
  }

  const busy = state === 'scanning' || state === 'saving';
  return (
    <section className={`snap-receipt insight-panel${compact ? ' compact' : ''}`} aria-labelledby="snap-receipt-title">
      <div className="section-heading">
        <div><p className="eyebrow">Private on-device scan</p><h2 id="snap-receipt-title">Snap Receipt</h2></div>
      </div>
      <p className="snap-receipt-note">Your image and recognized text stay in this browser. Spending changes only after you confirm.</p>
      <label htmlFor="receipt-image">Receipt image</label>
      <input
        ref={fileInput}
        id="receipt-image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={busy}
        onChange={(event) => selectFile(event.target.files?.[0])}
      />
      {previewUrl && <img className="receipt-preview" src={previewUrl} alt="Selected receipt preview" />}
      {state === 'scanning' && (
        <div className="receipt-progress" aria-live="polite">
          <progress aria-label="Receipt scan progress" value={progress} max={100}>{progress}%</progress>
          <span>Recognizing receipt… {progress}%</span>
        </div>
      )}
      {warning && <p className="form-warning" role="alert">{warning}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {(state === 'review' || state === 'saving') && (
        <div className="receipt-review">
          <label htmlFor="receipt-merchant">Merchant</label>
          <input id="receipt-merchant" value={merchant} maxLength={200} required disabled={busy} onChange={(event) => setMerchant(event.target.value)} />
          <label htmlFor="receipt-amount">Amount</label>
          <input id="receipt-amount" value={amount} inputMode="decimal" required disabled={busy} onChange={(event) => setAmount(event.target.value)} />
          <label htmlFor="receipt-category">Category</label>
          <select id="receipt-category" value={category} disabled={busy} onChange={(event) => setCategory(event.target.value as SpendingCategory)}>
            {categories.map((value) => <option value={value} key={value}>{categoryPresentation[value].label}</option>)}
          </select>
          <div className="category-choice"><span>Selected category</span><CategoryBadge category={category} /></div>
          <div className="receipt-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void confirm()}>{state === 'saving' ? 'Saving…' : 'Confirm spending'}</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={reset}>Cancel receipt</button>
          </div>
        </div>
      )}
      {(state === 'idle' || state === 'scanning') && (
        <button type="button" className="primary-button" disabled={!file || busy} onClick={() => void scan()}>{state === 'scanning' ? 'Scanning receipt…' : 'Scan receipt'}</button>
      )}
    </section>
  );
}
