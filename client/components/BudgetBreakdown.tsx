import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { BudgetBreakdownData, MonthBudgetBreakdown } from '../../shared/contracts';
import { api, ApiError } from '../api';
import { formatMoney, formatMonth } from '../format';
import { BreakdownCalendar } from './BreakdownCalendar';

interface BudgetBreakdownProps { initialYear: string; initialMonth: string; }

const zeroMonth = (month: string): MonthBudgetBreakdown => ({ month, income: '0.00', spending: '0.00', savings: '0.00', amountLeft: '0.00', budgetUsage: '0.00' });

export function BudgetBreakdown({ initialYear, initialMonth }: BudgetBreakdownProps) {
  const [year, setYear] = useState(initialYear);
  const [yearDraft, setYearDraft] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const requestGeneration = useRef(0);
  const requestKey = `${year}|${month}`;
  const [result, setResult] = useState<{ key: string; data?: BudgetBreakdownData; error?: string }>({ key: '' });
  const current = result.key === requestKey ? result : { key: requestKey };

  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    setResult({ key: requestKey });
    const query = new URLSearchParams({ year, month });
    void api.budgetBreakdown(query.toString()).then((value) => {
      if (!active || generation !== requestGeneration.current) return;
      if (value.year !== year || value.selectedMonth !== month) {
        setResult({ key: requestKey, error: `Budgeting breakdown response did not match ${formatMonth(month)}.` });
        return;
      }
      setResult({ key: requestKey, data: value });
    }).catch((caught) => {
      if (active && generation === requestGeneration.current) setResult({
        key: requestKey,
        error: caught instanceof ApiError ? caught.message : 'Budgeting breakdown could not be loaded',
      });
    });
    return () => { active = false; };
  }, [year, month, requestKey]);

  function loadYear(nextYear: string) {
    if (!/^\d{4}$/.test(nextYear)) return;
    setYear(nextYear);
    setYearDraft(nextYear);
    setMonth(`${nextYear}-${month.slice(5)}`);
  }

  const monthItems = current.data?.months ?? Array.from({ length: 12 }, (_, index) => zeroMonth(`${year}-${String(index + 1).padStart(2, '0')}`));
  const selectedSummary = monthItems.find((item) => item.month === month) ?? zeroMonth(month);

  return (
    <div className="budget-breakdown">
      <header className="analysis-period-header year-header">
        <button className="icon-button" type="button" aria-label="Previous year" onClick={() => loadYear(String(Number(year) - 1).padStart(4, '0'))}><ChevronLeft aria-hidden="true" /></button>
        <div><p className="eyebrow">Budgeting Breakdown</p><h2>{year} budgeting breakdown</h2></div>
        <button className="icon-button" type="button" aria-label="Next year" onClick={() => loadYear(String(Number(year) + 1).padStart(4, '0'))}><ChevronRight aria-hidden="true" /></button>
      </header>
      <form className="year-picker" onSubmit={(event) => { event.preventDefault(); loadYear(yearDraft); }}>
        <label htmlFor="breakdown-year">Report year</label>
        <input id="breakdown-year" inputMode="numeric" pattern="\d{4}" value={yearDraft} onChange={(event) => setYearDraft(event.target.value)} />
        <button className="secondary-button" type="submit">Load year</button>
      </form>
      {current.error && <div className="page-state compact-state error" role="alert">{current.error}</div>}
      {!current.data && !current.error && <div className="page-state compact-state">Loading breakdown…</div>}
      {current.data && (
        <>
          <div className="month-rail" aria-label="Months in selected year">
            {monthItems.map((item) => {
              const selected = item.month === month;
              const usage = Math.min(100, Math.max(0, Number(item.budgetUsage)));
              return (
                <button type="button" aria-label={`${formatMonth(item.month)} budget`} aria-pressed={selected} onClick={() => setMonth(`${year}-${item.month.slice(5)}`)} key={item.month}>
                  <strong>{formatMonth(item.month).split(' ')[0]}</strong>
                  <dl>
                    <div><dt>Income</dt><dd>{formatMoney(item.income)}</dd></div>
                    <div><dt>Spending</dt><dd>{formatMoney(item.spending)}</dd></div>
                    <div><dt>Savings</dt><dd>{formatMoney(item.savings)}</dd></div>
                    <div><dt>Amount left</dt><dd className={item.amountLeft.startsWith('-') ? 'negative' : undefined}>{formatMoney(item.amountLeft)}</dd></div>
                  </dl>
                  <span className="month-usage"><span>{item.budgetUsage}%</span><progress aria-label={`${formatMonth(item.month)} budget usage`} aria-valuenow={usage} max="100" value={usage} /></span>
                </button>
              );
            })}
          </div>
          <section className="breakdown-summary" data-testid="breakdown-summary" aria-label={`${formatMonth(month)} summary`}>
            <div><span>Income</span><strong>{formatMoney(selectedSummary.income)}</strong></div>
            <div><span>Spending</span><strong>{formatMoney(selectedSummary.spending)}</strong></div>
            <div><span>Savings</span><strong>{formatMoney(selectedSummary.savings)}</strong></div>
            <div className={selectedSummary.amountLeft.startsWith('-') ? 'negative' : undefined}><span>Amount left</span><strong>{formatMoney(selectedSummary.amountLeft)}</strong></div>
          </section>
          <div className="breakdown-layout">
            <BreakdownCalendar month={month} days={current.data.days} />
          </div>
        </>
      )}
    </div>
  );
}
