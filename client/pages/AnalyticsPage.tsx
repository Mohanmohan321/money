import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';

import type { AnalyticsData } from '../../shared/contracts';
import { api, ApiError } from '../api';
import { MovementChart } from '../components/MovementChart';

type Period = AnalyticsData['period'];

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<AnalyticsData>();
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    void api.analytics(new URLSearchParams({ period }).toString()).then(setData).catch((caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Analytics could not be loaded');
    });
  }, [period]);

  return (
    <div className="page analytics-page">
      <header className="page-header analytics-header">
        <div><p className="eyebrow">Patterns, not accounting</p><h1>Analytics</h1></div>
        <label className="period-picker">Group by<select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option></select></label>
      </header>
      {error && <div className="page-state error" role="alert">{error}</div>}
      {!data ? <div className="page-state">Building the view…</div> : (
        <>
          <section className="insight-panel analytics-chart">
            <div className="section-heading"><div><p className="eyebrow">{data.from} — {data.to}</p><h2>Money movement</h2></div><BarChart3 aria-hidden="true" /></div>
            <MovementChart points={data.movement} />
          </section>
          <section className="analysis-grid" aria-label="Category analysis">
            <article className="analysis-card transaction"><p>Transactions</p><strong>{data.transactions.totalAmount}</strong><span>{data.transactions.count} records · avg {data.transactions.averageAmount}</span></article>
            <article className="analysis-card lent"><p>Money lent</p><strong>{data.lending.totalAmount}</strong><span>{data.lending.count} records · avg {data.lending.averageAmount}</span></article>
            <article className="analysis-card borrowed"><p>Money borrowed</p><strong>{data.borrowing.totalAmount}</strong><span>{data.borrowing.count} records · avg {data.borrowing.averageAmount}</span></article>
          </section>
          <section className="people-grid">
            <article className="people-panel"><h2>Lending by person</h2>{data.lendingByPerson.length === 0 ? <p>No lending in this period.</p> : data.lendingByPerson.map((person) => <div className="person-row" key={person.personName}><span>{person.personName}<small>{person.numberOfLoans} loans</small></span><strong>{person.totalAmount}</strong></div>)}</article>
            <article className="people-panel"><h2>Borrowing by person</h2>{data.borrowingByPerson.length === 0 ? <p>No borrowing in this period.</p> : data.borrowingByPerson.map((person) => <div className="person-row" key={person.personName}><span>{person.personName}<small>{person.numberOfBorrowings} records</small></span><strong>{person.totalAmount}</strong></div>)}</article>
          </section>
        </>
      )}
    </div>
  );
}
