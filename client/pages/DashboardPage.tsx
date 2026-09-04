import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';

import type { DashboardData, MonthlyAnalysisData, NetWorthSummary, UpsertBudgetInput, Vault } from '../../shared/contracts';
import { api } from '../api';
import { BudgetOverview } from '../components/BudgetOverview';
import { MovementChart } from '../components/MovementChart';
import { NetWorthCard } from '../components/NetWorthCard';
import { RecentActivity } from '../components/RecentActivity';

function localCurrentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('The current month could not be determined');
  return `${year}-${month}`;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [monthly, setMonthly] = useState<MonthlyAnalysisData>();
  const [netWorth, setNetWorth] = useState<NetWorthSummary>();
  const [, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPartialFailure, setHasPartialFailure] = useState(false);
  const [month] = useState(localCurrentMonth);
  const mounted = useRef(false);
  const groupedRequestGeneration = useRef(0);
  const monthlyRequestGeneration = useRef(0);
  const monthlyQuery = new URLSearchParams({ month }).toString();

  const loadDashboard = useCallback(async () => {
    const groupedGeneration = ++groupedRequestGeneration.current;
    const monthlyGeneration = ++monthlyRequestGeneration.current;
    setLoading(true);
    const results = await Promise.allSettled([
      api.dashboard(),
      api.monthlyAnalysis(monthlyQuery),
      api.netWorth(),
      api.vaults(),
    ] as const);

    if (!mounted.current || groupedGeneration !== groupedRequestGeneration.current) return;
    const monthlyResultIsCurrent = monthlyGeneration === monthlyRequestGeneration.current;
    if (results[0].status === 'fulfilled') setData(results[0].value);
    if (results[1].status === 'fulfilled' && monthlyResultIsCurrent) {
      setMonthly(results[1].value);
    }
    if (results[2].status === 'fulfilled') setNetWorth(results[2].value);
    if (results[3].status === 'fulfilled') setVaults(results[3].value.items);
    setHasPartialFailure(results.some((result, index) => (
      result.status === 'rejected' && (index !== 1 || monthlyResultIsCurrent)
    )));
    setLoading(false);
  }, [monthlyQuery]);

  useEffect(() => {
    mounted.current = true;
    void loadDashboard();
    return () => {
      mounted.current = false;
      groupedRequestGeneration.current += 1;
      monthlyRequestGeneration.current += 1;
    };
  }, [loadDashboard]);

  async function saveBudget(input: UpsertBudgetInput) {
    await api.saveBudget(month, input);
    const monthlyGeneration = ++monthlyRequestGeneration.current;
    const refreshed = await api.monthlyAnalysis(monthlyQuery);
    if (mounted.current && monthlyGeneration === monthlyRequestGeneration.current) {
      setMonthly(refreshed);
    }
  }

  if (loading && !data && !monthly && !netWorth) {
    return <div className="page-state">Reading your ledger…</div>;
  }

  return (
    <div className="page dashboard-page">
      {hasPartialFailure && (
        <div className="partial-failure" role="alert">
          <span>Some dashboard details could not be loaded.</span>
          <button className="text-button" type="button" onClick={() => void loadDashboard()}>
            Refresh and try again
          </button>
        </div>
      )}

      {monthly && <BudgetOverview data={monthly} onSave={saveBudget} />}
      {netWorth && <NetWorthCard data={netWorth} />}
      {monthly && <RecentActivity items={monthly.recentActivity} />}

      {data && (
        <>
          <header className="page-header dashboard-header">
            <div>
              <p className="eyebrow">Private ledger</p>
              <h1>Today's snapshot</h1>
            </div>
            <p className="date-stamp">{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}</p>
          </header>

          <section className="daily-ledger" aria-label="Today's highlights">
            <article className="ledger-row transaction">
              <span className="ledger-icon"><ReceiptText aria-hidden="true" /></span>
              <div><p>Transactions</p><small>{data.today.transactionCount} records</small></div>
              <strong>{data.today.totalTransactions}</strong>
            </article>
            <article className="ledger-row lent">
              <span className="ledger-icon"><ArrowUpRight aria-hidden="true" /></span>
              <div><p>Money lent</p><small>{data.today.lendingCount} records</small></div>
              <strong>{data.today.totalLent}</strong>
            </article>
            <article className="ledger-row borrowed">
              <span className="ledger-icon"><ArrowDownLeft aria-hidden="true" /></span>
              <div><p>Money borrowed</p><small>{data.today.borrowingCount} records</small></div>
              <strong>{data.today.totalBorrowed}</strong>
            </article>
          </section>

          <section className="insight-panel">
            <div className="section-heading">
              <div><p className="eyebrow">Seven-day view</p><h2>This week in motion</h2></div>
              <span>{data.week.recordCount} records</span>
            </div>
            <MovementChart points={data.week.daily} compact />
          </section>

          <section className="month-line" aria-label="This month summary">
            <div><span>This month</span><strong>{data.month.recordCount}</strong><small>records logged</small></div>
            <div className="mini-rails" aria-hidden="true"><span /><span /><span /></div>
          </section>
        </>
      )}
    </div>
  );
}
