import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { BudgetMonthWorkspace, BudgetSettings } from '../../shared/budget-workspace';
import { api, ApiError } from '../api';
import { BudgetCalendar } from '../components/budget/BudgetCalendar';
import { BudgetConfiguration } from '../components/budget/BudgetConfiguration';
import { BudgetDayEditor } from '../components/budget/BudgetDayEditor';
import { BudgetTrends } from '../components/budget/BudgetTrends';
import { formatMoney, formatMonth } from '../format';

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number); const absolute = year * 12 + value - 1 + delta;
  return `${Math.floor(absolute / 12)}-${String(absolute % 12 + 1).padStart(2, '0')}`;
}

type View = 'calendar' | 'trends' | 'configuration';

export function BudgetPage() {
  const today = localToday();
  const [month, setMonth] = useState(today.slice(0, 7)); const [data, setData] = useState<BudgetMonthWorkspace>();
  const [selectedDate, setSelectedDate] = useState<string>(); const [view, setView] = useState<View>('calendar');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setError(''); setData(await api.budgetWorkspace(month, today)); } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Budget workspace could not be loaded'); } }, [month, today]);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (operation: () => Promise<unknown>, message: string) => { setBusy(true); setError(''); try { await operation(); await load(); setNotice(message); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Changes could not be saved'); throw caught; } finally { setBusy(false); } };
  const selectedDay = data?.days.find((day) => day.date === selectedDate);

  return <div className="page budget-page">
    <header className="page-header"><div><p className="eyebrow">Budget calendar</p><h1>Budget overview</h1></div><p className="date-stamp">Local dates</p></header>
    <div className="budget-tabs" role="tablist" aria-label="Budget workspace views">{(['calendar', 'trends', 'configuration'] as const).map((item, index, items) => <button type="button" role="tab" aria-selected={view === item} key={item} onClick={() => setView(item)} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length; setView(items[next]); (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus(); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {notice && <p className="budget-notice" role="status">{notice}</p>}{error && <p className="page-state compact-state error" role="alert">{error}</p>}{!data && !error && <div className="page-state compact-state">Loading budget…</div>}
    {data && <>
      <section className="budget-summary-grid" aria-label="Monthly budget summary">
        <article><span>Monthly budget</span><strong>₹{formatMoney(data.summary.monthlyBudget)}</strong></article>
        <article><span>Spent so far</span><strong>₹{formatMoney(data.summary.actual)}</strong></article>
        <article><span>Remaining</span><strong className={Number(data.summary.remaining) < 0 ? 'negative' : ''}>₹{formatMoney(data.summary.remaining)}</strong></article>
        <article><span>Budget used</span><strong>{data.summary.utilization ?? '—'}%</strong><progress max="100" value={Math.min(100, Number(data.summary.utilization ?? 0))} /></article>
        <article><span>Recorded daily average</span><strong>₹{formatMoney(data.summary.dailyRecordedAverage)}</strong></article>
        <article><span>Days under / over</span><strong>{data.summary.underBudgetDays} / {data.summary.overBudgetDays}</strong></article>
      </section>
      {view === 'calendar' && <section aria-labelledby="budget-month-heading">
        <div className="budget-month-controls"><button className="icon-button" type="button" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setSelectedDate(undefined); }}><ChevronLeft aria-hidden="true" /></button><div><h2 id="budget-month-heading">{formatMonth(month)}</h2><button type="button" className="text-button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>Today</button></div><button className="icon-button" type="button" aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setSelectedDate(undefined); }}><ChevronRight aria-hidden="true" /></button></div>
        <BudgetCalendar month={month} days={data.days} selectedDate={selectedDate} onSelect={setSelectedDate} />
        <div className="budget-calendar-legend"><span className="under">Within budget</span><span className="over">Over budget</span><span className="missing">No record</span><span className="future">Future</span></div>
        <section className="budget-week-summary" aria-label="Weekly budget summaries"><h2>Weekly view</h2>{data.weeks.map((week) => <article key={week.from}><span>{week.from} – {week.to}</span><strong>₹{formatMoney(week.actual)} of ₹{formatMoney(week.planned)}</strong><small>{Number(week.remaining) < 0 ? `Exceeded by ₹${formatMoney(week.remaining.slice(1))}` : `₹${formatMoney(week.remaining)} remaining`}</small></article>)}</section>
      </section>}
      {view === 'trends' && <BudgetTrends data={data} />}
      {view === 'configuration' && <BudgetConfiguration settings={data.settings} busy={busy} onSave={(settings: BudgetSettings) => mutate(() => api.saveBudgetSettings(settings), 'Budget configuration saved')} />}
      {selectedDay && <BudgetDayEditor day={selectedDay} categories={data.settings.categories} busy={busy} onClose={() => setSelectedDate(undefined)}
        onSave={(input) => mutate(() => input.id ? api.updateBudgetExpense(input.id, input) : api.createBudgetExpense({ ...input, idempotencyKey: crypto.randomUUID() }), input.id ? 'Expense updated' : 'Expense saved')}
        onDelete={(id) => mutate(() => api.deleteBudgetExpense(id), 'Expense deleted')}
        onRecordZero={() => mutate(() => api.recordZeroBudgetDay(selectedDay.date, true), '₹0 spending recorded')}
        onOverride={(plannedAmount) => mutate(() => api.saveBudgetOverride(selectedDay.date, { plannedAmount, note: null }), 'Date budget updated')} />}
    </>}
  </div>;
}
