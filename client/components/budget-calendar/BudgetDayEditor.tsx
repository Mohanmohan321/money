import Decimal from 'decimal.js';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';

import type {
  BudgetCalendarCategory,
  BudgetCalendarDay,
  BudgetCalendarExpense,
} from '../../../shared/budget-calendar';
import { api, ApiError } from '../../api';
import { formatMoney } from '../../format';

interface BudgetDayEditorProps {
  day: BudgetCalendarDay;
  categories: BudgetCalendarCategory[];
  onClose(): void;
  onMutationComplete(): void;
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function createKey(): string {
  return crypto.randomUUID();
}

export function BudgetDayEditor({
  day,
  categories,
  onClose,
  onMutationComplete,
}: BudgetDayEditorProps) {
  const [editing, setEditing] = useState<BudgetCalendarExpense>();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyKey = useRef(createKey());

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  function resetDraft() {
    setEditing(undefined);
    setCategoryId(categories[0]?.id ?? '');
    setAmount('');
    setDescription('');
    setNotes('');
    idempotencyKey.current = createKey();
  }

  function editExpense(expense: BudgetCalendarExpense) {
    setEditing(expense);
    setCategoryId(expense.categoryId);
    setAmount(expense.amount);
    setDescription(expense.description ?? '');
    setNotes(expense.notes ?? '');
    setMessage('');
    setError('');
  }

  const parsedAmount = /^\d+(?:\.\d{0,2})?$/.test(amount) ? new Decimal(amount || 0) : new Decimal(0);
  const baseActual = new Decimal(day.actualAmount).minus(editing?.amount ?? 0);
  const previewActual = baseActual.plus(parsedAmount);
  const planned = new Decimal(day.plannedAmount);
  const remaining = planned.minus(previewActual);
  const utilization = planned.eq(0)
    ? (previewActual.eq(0) ? '0.00' : null)
    : previewActual.div(planned).times(100).toFixed(2);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const common = {
        expenseDate: day.date,
        categoryId,
        amount,
        ...(description.trim() ? { description } : {}),
        ...(notes.trim() ? { notes } : {}),
      };
      if (editing) {
        await api.updateBudgetCalendarExpense(editing.id, common);
        setMessage('Expense updated');
      } else {
        await api.createBudgetCalendarExpense({ ...common, idempotencyKey: idempotencyKey.current });
        setMessage('Expense saved');
      }
      resetDraft();
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Expense could not be saved');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function removeExpense(expense: BudgetCalendarExpense) {
    if (!window.confirm(`Delete ${expense.categoryName} expense?`)) return;
    setError('');
    try {
      await api.deleteBudgetCalendarExpense(expense.id);
      setMessage('Expense deleted');
      if (editing?.id === expense.id) resetDraft();
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Expense could not be deleted');
    }
  }

  async function recordZero() {
    setError('');
    try {
      await api.setBudgetCalendarDayRecord(day.date, true);
      setMessage('₹0 spending recorded');
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Zero spending could not be recorded');
    }
  }

  return (
    <section className="budget-day-sheet" role="dialog" aria-modal="true" aria-labelledby="budget-day-title">
      <header className="budget-day-sheet-header">
        <div><p className="eyebrow">Daily budget</p><h2 id="budget-day-title">{dateLabel(day.date)}</h2></div>
        <button className="icon-button" type="button" aria-label="Close day editor" onClick={onClose}><X aria-hidden="true" /></button>
      </header>

      <dl className="budget-day-metrics">
        <div><dt>Planned</dt><dd>₹{formatMoney(day.plannedAmount)}</dd></div>
        <div><dt>Recorded</dt><dd>₹{formatMoney(day.actualAmount)}</dd></div>
        <div className={remaining.lt(0) ? 'negative' : ''}>
          <dt>{remaining.lt(0) ? 'Over budget' : 'Preview remaining'}</dt>
          <dd>₹{formatMoney(remaining.abs().toFixed(2))}</dd>
        </div>
      </dl>

      {amount && (
        <div className={`budget-live-calculation${remaining.lt(0) ? ' over' : ''}`} aria-live="polite">
          <strong>{remaining.lt(0) ? `Over budget by ₹${formatMoney(remaining.abs().toFixed(2))}` : `₹${formatMoney(remaining.toFixed(2))} remaining`}</strong>
          <span>{utilization === null ? 'No finite utilization for a zero plan' : `${utilization}% utilized`}</span>
        </div>
      )}

      {day.expenses.length > 0 && (
        <div className="budget-expense-list" aria-label="Saved expenses">
          {day.expenses.map((expense) => (
            <article key={expense.id}>
              <div><strong>{expense.categoryName}</strong><span>{expense.description || 'No description'}</span></div>
              <b>₹{formatMoney(expense.amount)}</b>
              <button type="button" className="icon-button subtle" aria-label={`Edit ${expense.categoryName} expense`} onClick={() => editExpense(expense)}><Pencil aria-hidden="true" /></button>
              <button type="button" className="icon-button subtle" aria-label={`Delete ${expense.categoryName} expense`} onClick={() => void removeExpense(expense)}><Trash2 aria-hidden="true" /></button>
            </article>
          ))}
        </div>
      )}

      <form className="budget-expense-form" onSubmit={submit}>
        <label htmlFor="budget-expense-category">Expense category</label>
        <select id="budget-expense-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
          {categories.filter(({ active }) => active).map((category) => (
            <option value={category.id} key={category.id}>{category.name}</option>
          ))}
        </select>
        <label htmlFor="budget-expense-amount">Actual spending</label>
        <input id="budget-expense-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} pattern="\d+(?:\.\d{1,2})?" required />
        <label htmlFor="budget-expense-description">Description <span>Optional</span></label>
        <input id="budget-expense-description" value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} />
        <label htmlFor="budget-expense-notes">Notes <span>Optional</span></label>
        <textarea id="budget-expense-notes" value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />
        {error && <div role="alert" className="form-message error">{error}</div>}
        {message && <div role="status" className="form-message success">{message}</div>}
        <div className="budget-expense-actions">
          {!editing && day.expenses.length === 0 && day.recordState !== 'recorded_zero' && (
            <button className="secondary-button" type="button" onClick={() => void recordZero()}>Record ₹0 spent</button>
          )}
          {editing && <button className="secondary-button" type="button" onClick={resetDraft}>Cancel edit</button>}
          <button className="primary-button" type="submit" disabled={submitting || categories.length === 0}>
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </form>
    </section>
  );
}
