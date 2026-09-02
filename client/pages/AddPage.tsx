import { FormEvent, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';

import { api, ApiError } from '../api';

type EntryMode = 'transaction' | 'lent' | 'borrowed';

const modes = {
  transaction: { label: 'Transaction', action: 'Save transaction', icon: ReceiptText, field: 'Description', placeholder: 'What was this for?' },
  lent: { label: 'Money lent', action: 'Save money lent', icon: ArrowUpRight, field: 'Person name', placeholder: 'Who did you lend to?' },
  borrowed: { label: 'Money borrowed', action: 'Save money borrowed', icon: ArrowDownLeft, field: 'Person name', placeholder: 'Who did you borrow from?' },
} as const;

export function AddPage() {
  const [mode, setMode] = useState<EntryMode>('transaction');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selected = modes[mode];
  const SelectedIcon = selected.icon;

  function chooseMode(nextMode: EntryMode) {
    setMode(nextMode);
    setLabel('');
    setAmount('');
    setMessage('');
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'transaction') await api.createTransaction(label, amount);
      if (mode === 'lent') await api.createLent(label, amount);
      if (mode === 'borrowed') await api.createBorrowed(label, amount);
      setLabel('');
      setAmount('');
      setMessage(`${selected.label} saved`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'This record could not be saved');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page add-page">
      <header className="page-header"><div><p className="eyebrow">Quick entry</p><h1>Log money</h1></div></header>
      <div className="entry-tabs" role="tablist" aria-label="Record type">
        {(Object.keys(modes) as EntryMode[]).map((key) => {
          const Icon = modes[key].icon;
          return (
            <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => chooseMode(key)} className={key}>
              <Icon aria-hidden="true" /><span>{modes[key].label}</span>
            </button>
          );
        })}
      </div>

      <form className={`entry-form ${mode}`} onSubmit={submit}>
        <div className="entry-form-intro"><SelectedIcon aria-hidden="true" /><div><p>{selected.label}</p><small>The time is added automatically.</small></div></div>
        <label htmlFor="entry-label">{selected.field}</label>
        <input id="entry-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={selected.placeholder} maxLength={mode === 'transaction' ? 200 : 100} required />
        <label htmlFor="entry-amount">Amount</label>
        <input id="entry-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" autoComplete="off" required />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : selected.action}</button>
      </form>
    </div>
  );
}
