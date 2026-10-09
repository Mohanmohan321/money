import { useEffect, useState } from 'react';
import type { BudgetCategoryConfig, BudgetDay, BudgetExpense } from '../../../shared/budget-workspace';
import { formatMoney } from '../../format';

function labelDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function BudgetDayEditor({ day, categories, busy, onClose, onSave, onDelete, onRecordZero, onOverride }: {
  day: BudgetDay; categories: BudgetCategoryConfig[]; busy: boolean; onClose(): void;
  onSave(input: { id?: string; expenseDate: string; amount: string; budgetCategory: string; description: string; notes?: string }): Promise<void>;
  onDelete(id: string): Promise<void>; onRecordZero(): Promise<void>; onOverride(amount: string): Promise<void>;
}) {
  const [editing, setEditing] = useState<BudgetExpense>();
  const [amount, setAmount] = useState(''); const [category, setCategory] = useState(categories.find((item) => item.active)?.id ?? 'miscellaneous');
  const [description, setDescription] = useState(''); const [notes, setNotes] = useState(''); const [planned, setPlanned] = useState(day.planned);
  useEffect(() => { setPlanned(day.planned); }, [day.planned]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  function edit(item: BudgetExpense) { setEditing(item); setAmount(item.amount); setCategory(item.budgetCategory); setDescription(item.description); setNotes(item.notes ?? ''); }
  function reset() { setEditing(undefined); setAmount(''); setDescription(''); setNotes(''); }
  async function submit(event: React.FormEvent) { event.preventDefault(); try { await onSave({ id: editing?.id, expenseDate: day.date, amount, budgetCategory: category, description, ...(notes ? { notes } : {}) }); reset(); } catch { /* The page keeps the draft and announces the API error. */ } }
  const remainingLabel = Number(day.remaining) < 0 ? `Over budget by ₹${formatMoney(day.remaining.slice(1))}` : `₹${formatMoney(day.remaining)} remaining`;
  return <div className="budget-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="budget-day-editor" role="dialog" aria-modal="true" aria-label={`${labelDate(day.date)} expenses`}>
      <header><div><p className="eyebrow">Daily budget</p><h2>{labelDate(day.date)}</h2></div><button type="button" className="icon-button" aria-label="Close expense editor" onClick={onClose}>×</button></header>
      <div className="budget-day-position"><span>Planned ₹{formatMoney(day.planned)}</span><strong className={day.status === 'over' ? 'negative' : ''}>{remainingLabel}</strong><span>{day.utilization === null ? 'No finite utilization' : `${day.utilization}% used`}</span></div>
      <form className="budget-expense-form" onSubmit={(event) => void submit(event)}>
        <label>Planned budget<input inputMode="decimal" value={planned} onChange={(event) => setPlanned(event.target.value)} /></label>
        <button type="button" className="text-button" disabled={busy || planned === day.planned} onClick={() => void onOverride(planned).catch(() => undefined)}>Save date override</button>
        <label>Amount<input autoFocus required inputMode="decimal" aria-label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Expense category<select aria-label="Expense category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Description<input required aria-label="Description" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Notes<textarea aria-label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="primary-button sticky-save" disabled={busy} type="submit">{editing ? 'Save changes' : 'Save expense'}</button>
      </form>
      {day.expenses.length === 0 ? <p className="budget-empty">No expense recorded. Missing data is not treated as ₹0.</p> : <div className="budget-expense-list">{day.expenses.map((item) => <article key={item.id}><div><strong>{item.description}</strong><span>{categories.find((categoryItem) => categoryItem.id === item.budgetCategory)?.name ?? item.budgetCategory}</span></div><b>₹{formatMoney(item.amount)}</b><button type="button" onClick={() => edit(item)}>Edit</button><button type="button" className="danger-action" onClick={() => void onDelete(item.id).catch(() => undefined)}>Delete</button></article>)}</div>}
      {day.expenses.length === 0 && <button type="button" className="secondary-button" disabled={busy} onClick={() => void onRecordZero().catch(() => undefined)}>Record ₹0 spent</button>}
    </section>
  </div>;
}
