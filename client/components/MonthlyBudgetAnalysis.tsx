import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { MonthlyAnalysisData } from '../../shared/contracts';
import { api, ApiError } from '../api';
import { formatMoney, formatMonth } from '../format';
import { CategoryBadge } from './CategoryBadge';
import { WeeklyExpenseTracker } from './WeeklyExpenseTracker';

interface MonthlyBudgetAnalysisProps { initialMonth: string; }

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const absolute = year * 12 + monthNumber - 1 + delta;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = absolute - nextYear * 12 + 1;
  return `${String(Math.max(0, nextYear)).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day + days);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function MonthlyBudgetAnalysis({ initialMonth }: MonthlyBudgetAnalysisProps) {
  const [month, setMonth] = useState(initialMonth);
  const [weekAnchor, setWeekAnchor] = useState<string>();
  const [data, setData] = useState<MonthlyAnalysisData>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    const query = new URLSearchParams({ month });
    if (weekAnchor) query.set('week', weekAnchor);
    void api.monthlyAnalysis(query.toString()).then((value) => { if (active) setData(value); }).catch((caught) => {
      if (active) setError(caught instanceof ApiError ? caught.message : 'Monthly analysis could not be loaded');
    });
    return () => { active = false; };
  }, [month, weekAnchor]);

  function navigateMonth(delta: number) {
    setMonth((value) => shiftMonth(value, delta));
    setWeekAnchor(undefined);
  }

  return (
    <div className="monthly-analysis">
      <header className="analysis-period-header">
        <button className="icon-button" type="button" aria-label="Previous month" onClick={() => navigateMonth(-1)}><ChevronLeft aria-hidden="true" /></button>
        <div><p className="eyebrow">Monthly Budget</p><h2>{formatMonth(month)}</h2></div>
        <button className="icon-button" type="button" aria-label="Next month" onClick={() => navigateMonth(1)}><ChevronRight aria-hidden="true" /></button>
      </header>
      {error && <div className="page-state compact-state error" role="alert">{error}</div>}
      {!data && !error && <div className="page-state compact-state">Loading monthly budget…</div>}
      {data && (
        <>
          <section className="analysis-hero" aria-label="Monthly spending summary">
            <div><span>Total spending</span><strong>{formatMoney(data.summary.spending)}</strong></div>
            <div className="score-disc" aria-label={`Budget Score ${data.summary.budgetScore}%`}><span>Budget Score</span><strong>{data.summary.budgetScore}%</strong></div>
          </section>
          <section className="category-spend-section" aria-labelledby="category-spend-heading">
            <div className="section-heading"><div><p className="eyebrow">Server-classified</p><h3 id="category-spend-heading">Spending by category</h3></div></div>
            <div className="category-spend-rail">
              {data.categories.map((item) => (
                <article className={`category-spend-card category-${item.category}`} data-testid={`category-spend-${item.category}`} key={item.category}>
                  <CategoryBadge category={item.category} />
                  <strong>{formatMoney(item.amount)}</strong>
                  <span>{item.percentage}% of spending</span>
                </article>
              ))}
            </div>
          </section>
          <WeeklyExpenseTracker
            days={data.week}
            weekFrom={data.weekFrom}
            weekTo={data.weekTo}
            onPreviousWeek={() => setWeekAnchor(shiftDate(data.weekFrom, -7))}
            onNextWeek={() => setWeekAnchor(shiftDate(data.weekFrom, 7))}
          />
        </>
      )}
    </div>
  );
}
