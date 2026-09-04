import { FormEvent, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, ReceiptText } from 'lucide-react';

import type { IncomeCategory, SpendingCategory } from '../../shared/contracts';
import { categorizeTransaction } from '../../shared/budgeting';
import { api, ApiError } from '../api';
import { CategoryBadge, categoryPresentation } from '../components/CategoryBadge';

type EntryMode = 'transaction' | 'income' | 'lent' | 'borrowed';

const modes = {
  transaction: { label: 'Transaction', action: 'Save transaction', icon: ReceiptText, field: 'Description', placeholder: 'What was this for?' },
  income: { label: 'Income', action: 'Save income', icon: CircleDollarSign, field: 'Income source', placeholder: 'Where did it come from?' },
  lent: { label: 'Money lent', action: 'Save money lent', icon: ArrowUpRight, field: 'Person name', placeholder: 'Who did you lend to?' },
  borrowed: { label: 'Money borrowed', action: 'Save money borrowed', icon: ArrowDownLeft, field: 'Person name', placeholder: 'Who did you borrow from?' },
} as const;

const spendingCategories = Object.keys(categoryPresentation) as SpendingCategory[];
const incomeCategories: ReadonlyArray<{ value: IncomeCategory; label: string }> = [
  { value: 'bonus', label: 'Bonus' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'refund', label: 'Refund' },
  { value: 'other', label: 'Other' },
];

export function AddPage() {
  const [mode, setMode] = useState<EntryMode>('transaction');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [spendingCategory, setSpendingCategory] = useState<SpendingCategory>('other');
  const [incomeCategory, setIncomeCategory] = useState<IncomeCategory>('other');
  const [categoryOverridden, setCategoryOverridden] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selected = modes[mode];
  const SelectedIcon = selected.icon;

  function resetEntry() {
    setLabel('');
    setAmount('');
    setSpendingCategory('other');
    setIncomeCategory('other');
    setCategoryOverridden(false);
  }

  function chooseMode(nextMode: EntryMode) {
    if (submittingRef.current || nextMode === mode) return;
    setMode(nextMode);
    resetEntry();
    setMessage('');
    setError('');
  }

  function changeLabel(nextLabel: string) {
    setLabel(nextLabel);
    if (mode === 'transaction' && !categoryOverridden) {
      setSpendingCategory(categorizeTransaction(nextLabel));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage('');
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'transaction') await api.createTransaction(label, amount, spendingCategory);
      if (mode === 'income') {
        await api.createIncome({ source: label, category: incomeCategory, amount });
      }
      if (mode === 'lent') await api.createLent(label, amount);
      if (mode === 'borrowed') await api.createBorrowed(label, amount);
      resetEntry();
      setMessage(`${selected.label} saved`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'This record could not be saved');
    } finally {
      submittingRef.current = false;
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
            <button
              key={key}
              id={`entry-tab-${key}`}
              type="button"
              role="tab"
              aria-controls="entry-panel"
              aria-selected={mode === key}
              disabled={submitting}
              onClick={() => chooseMode(key)}
              className={key}
            >
              <Icon aria-hidden="true" /><span>{modes[key].label}</span>
            </button>
          );
        })}
      </div>

      <form
        id="entry-panel"
        className={`entry-form ${mode}`}
        role="tabpanel"
        aria-labelledby={`entry-tab-${mode}`}
        onSubmit={submit}
      >
        <div className="entry-form-intro"><SelectedIcon aria-hidden="true" /><div><p>{selected.label}</p><small>The time is added automatically.</small></div></div>
        <label htmlFor="entry-label">{selected.field}</label>
        <input id="entry-label" value={label} onChange={(event) => changeLabel(event.target.value)} placeholder={selected.placeholder} maxLength={mode === 'transaction' || mode === 'income' ? 200 : 100} required />
        {mode === 'transaction' && (
          <>
            <label htmlFor="entry-category">Category</label>
            <select
              id="entry-category"
              value={spendingCategory}
              aria-describedby="entry-category-note"
              onChange={(event) => {
                setSpendingCategory(event.target.value as SpendingCategory);
                setCategoryOverridden(true);
              }}
            >
              {spendingCategories.map((category) => (
                <option key={category} value={category}>{categoryPresentation[category].label}</option>
              ))}
            </select>
            <div id="entry-category-note" className="category-choice" aria-live="polite">
              <span>{categoryOverridden ? 'Chosen category' : 'Suggested category'}</span>
              <CategoryBadge category={spendingCategory} />
            </div>
          </>
        )}
        {mode === 'income' && (
          <>
            <label htmlFor="income-category">Income category</label>
            <select id="income-category" value={incomeCategory} onChange={(event) => setIncomeCategory(event.target.value as IncomeCategory)}>
              {incomeCategories.map(({ value, label: categoryLabel }) => (
                <option key={value} value={value}>{categoryLabel}</option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="entry-amount">Amount</label>
        <input id="entry-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" autoComplete="off" required />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : selected.action}</button>
      </form>
    </div>
  );
}
