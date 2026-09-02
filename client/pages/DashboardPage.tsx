import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';

import type { DashboardData } from '../../shared/contracts';
import { api, ApiError } from '../api';
import { MovementChart } from '../components/MovementChart';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState('');

  useEffect(() => {
    void api.dashboard().then(setData).catch((caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Dashboard data could not be loaded');
    });
  }, []);

  if (error) return <div className="page-state error" role="alert">{error}</div>;
  if (!data) return <div className="page-state">Reading your ledger…</div>;

  return (
    <div className="page dashboard-page">
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
    </div>
  );
}
