import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, ReceiptText, Trash2 } from 'lucide-react';

import type { HistoryItem } from '../../shared/contracts';
import { api, ApiError } from '../api';

function itemLabel(item: HistoryItem): string {
  if (item.type === 'transaction') return item.description;
  if (item.type === 'income') return item.source;
  return item.personName;
}

function itemCategory(item: HistoryItem): string | undefined {
  if (item.type !== 'transaction' && item.type !== 'income') return undefined;
  return item.category
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

const icons = {
  transaction: ReceiptText,
  lent: ArrowUpRight,
  borrowed: ArrowDownLeft,
  income: CircleDollarSign,
};
const typeLabels = {
  transaction: 'Transaction',
  lent: 'Money lent',
  borrowed: 'Money borrowed',
  income: 'Income',
};

export function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '50', offset: '0' });
    if (type) query.set('type', type);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    try {
      const data = await api.history(query.toString());
      setItems(data.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'History could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [from, to, type]);

  useEffect(() => { void load(); }, []); // Initial unfiltered history only.

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  async function remove(item: HistoryItem) {
    if (!window.confirm(`Delete this ${typeLabels[item.type].toLowerCase()} record?`)) return;
    try {
      await api.deleteRecord(item.type, item.id);
      setItems((current) => current.filter(({ id }) => id !== item.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Record could not be deleted');
    }
  }

  return (
    <div className="page history-page">
      <header className="page-header"><div><p className="eyebrow">All movement</p><h1>History</h1></div></header>
      <form className="history-filters" onSubmit={applyFilters}>
        <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All records</option><option value="transaction">Transactions</option><option value="income">Income</option><option value="lent">Money lent</option><option value="borrowed">Money borrowed</option></select></label>
        <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="submit" className="secondary-button">Apply filters</button>
      </form>
      {error && <div className="page-state error" role="alert">{error}</div>}
      {loading ? <div className="page-state">Reading history…</div> : items.length === 0 ? (
        <div className="empty-state"><ReceiptText aria-hidden="true" /><h2>No records here yet</h2><p>Log income, a transaction, money lent, or money borrowed to begin.</p></div>
      ) : (
        <section className="history-list" aria-label="Financial history">
          {items.map((item) => {
            const Icon = icons[item.type];
            const category = itemCategory(item);
            return (
              <article className={`history-item ${item.type}`} key={`${item.type}-${item.id}`}>
                <span className="history-icon"><Icon aria-hidden="true" /></span>
                <div><strong>{itemLabel(item)}</strong><span>{typeLabels[item.type]} · {category ? `${category} · ` : ''}{new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</span></div>
                <b>{item.amount}</b>
                <button type="button" className="icon-button subtle" aria-label={`Delete ${itemLabel(item)}`} onClick={() => void remove(item)}><Trash2 aria-hidden="true" /></button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
