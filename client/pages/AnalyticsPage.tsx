import { useRef, useState } from 'react';

import { AnnualReport } from '../components/AnnualReport';
import { BudgetBreakdown } from '../components/BudgetBreakdown';
import { MonthlyBudgetAnalysis } from '../components/MonthlyBudgetAnalysis';

const tabs = ['Monthly Budget', 'Budgeting Breakdown', 'Annual Report'] as const;
type AnalysisTab = typeof tabs[number];

function localMonth() {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function AnalyticsPage() {
  const initialMonth = useRef(localMonth()).current;
  const initialYear = initialMonth.slice(0, 4);
  const [selectedTab, setSelectedTab] = useState<AnalysisTab>('Monthly Budget');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectByIndex(index: number) {
    const wrapped = (index + tabs.length) % tabs.length;
    setSelectedTab(tabs[wrapped]);
    tabRefs.current[wrapped]?.focus();
  }

  return (
    <div className="page analytics-page">
      <header className="page-header analytics-header"><div><p className="eyebrow">Plan, inspect, adjust</p><h1>Analysis</h1></div></header>
      <div className="analysis-tabs" role="tablist" aria-label="Analysis views">
        {tabs.map((tab, index) => (
          <button
            id={`analysis-tab-${index}`}
            role="tab"
            type="button"
            aria-selected={selectedTab === tab}
            aria-controls={`analysis-panel-${index}`}
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
      {tabs.map((tab, index) => selectedTab === tab && (
        <div id={`analysis-panel-${index}`} role="tabpanel" aria-labelledby={`analysis-tab-${index}`} tabIndex={0} key={tab}>
          {tab === 'Monthly Budget' && <MonthlyBudgetAnalysis initialMonth={initialMonth} />}
          {tab === 'Budgeting Breakdown' && <BudgetBreakdown initialYear={initialYear} initialMonth={initialMonth} />}
          {tab === 'Annual Report' && <AnnualReport initialYear={initialYear} />}
        </div>
      ))}
    </div>
  );
}
