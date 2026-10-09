import { useEffect, useRef, useState } from 'react';

import type { BudgetCalendarMonthView } from '../../shared/budget-calendar';
import { api, ApiError } from '../api';
import { formatMoney, formatMonth } from '../format';

const tabs = ['Calendar', 'Trends', 'Categories', 'Rules'] as const;
type BudgetCalendarTab = typeof tabs[number];

function localMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function BudgetCalendarPage() {
  const [selectedTab, setSelectedTab] = useState<BudgetCalendarTab>('Calendar');
  const [month] = useState(localMonth);
  const [result, setResult] = useState<{ data?: BudgetCalendarMonthView; error?: string }>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    const request = ++generation.current;
    setResult({});
    void api.budgetCalendarView(month).then((data) => {
      if (active && request === generation.current) setResult({ data });
    }).catch((caught) => {
      if (active && request === generation.current) {
        setResult({
          error: caught instanceof ApiError ? caught.message : 'Budget Calendar could not be loaded',
        });
      }
    });
    return () => { active = false; };
  }, [month]);

  function selectByIndex(index: number) {
    const wrapped = (index + tabs.length) % tabs.length;
    setSelectedTab(tabs[wrapped]);
    tabRefs.current[wrapped]?.focus();
  }

  return (
    <div className="page budget-calendar-page">
      <header className="page-header budget-calendar-header">
        <div><p className="eyebrow">Plan each day, spend with intent</p><h1>Budget Calendar</h1></div>
      </header>
      <div className="budget-calendar-tabs" role="tablist" aria-label="Budget Calendar views">
        {tabs.map((tab, index) => (
          <button
            id={`budget-calendar-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab}
            aria-controls={`budget-calendar-panel-${index}`}
            tabIndex={selectedTab === tab ? 0 : -1}
            ref={(node) => { tabRefs.current[index] = node; }}
            onClick={() => setSelectedTab(tab)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') { event.preventDefault(); selectByIndex(index + 1); }
              if (event.key === 'ArrowLeft') { event.preventDefault(); selectByIndex(index - 1); }
            }}
          >{tab}</button>
        ))}
      </div>
      <section
        id={`budget-calendar-panel-${tabs.indexOf(selectedTab)}`}
        role="tabpanel"
        aria-labelledby={`budget-calendar-tab-${tabs.indexOf(selectedTab)}`}
        tabIndex={0}
      >
        {result.error && <div className="page-state compact-state error" role="alert">{result.error}</div>}
        {!result.data && !result.error && <div className="page-state compact-state">Loading Budget Calendar…</div>}
        {result.data && selectedTab === 'Calendar' && (
          <section className="budget-calendar-placeholder" aria-label={`${formatMonth(month)} Budget Calendar`}>
            <p className="eyebrow">{formatMonth(month)}</p>
            <strong>{formatMoney(result.data.summary.monthlyBudget)} monthly budget</strong>
          </section>
        )}
        {result.data && selectedTab !== 'Calendar' && (
          <div className="compact-empty">{selectedTab} setup is ready.</div>
        )}
      </section>
    </div>
  );
}
