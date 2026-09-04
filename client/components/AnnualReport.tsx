import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { AnnualReportData } from '../../shared/contracts';
import { api, ApiError } from '../api';
import { formatMoney, formatMonth } from '../format';
import { CategoryPieChart, IncomeSourcePieChart, IncomeSpendingChart, SavingsLineChart } from './AccessibleCharts';

interface AnnualReportProps { initialYear: string; }

export function AnnualReport({ initialYear }: AnnualReportProps) {
  const [year, setYear] = useState(initialYear);
  const [yearDraft, setYearDraft] = useState(initialYear);
  const requestGeneration = useRef(0);
  const [result, setResult] = useState<{ year: string; data?: AnnualReportData; error?: string }>({ year: '' });
  const current = result.year === year ? result : { year };

  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    setResult({ year });
    void api.annualReport(new URLSearchParams({ year }).toString()).then((value) => {
      if (!active || generation !== requestGeneration.current) return;
      if (value.year !== year) {
        setResult({ year, error: `Annual report response did not match ${year}.` });
        return;
      }
      setResult({ year, data: value });
    }).catch((caught) => {
      if (active && generation === requestGeneration.current) setResult({
        year,
        error: caught instanceof ApiError ? caught.message : 'Annual report could not be loaded',
      });
    });
    return () => { active = false; };
  }, [year]);

  function loadYear(nextYear: string) {
    if (!/^\d{4}$/.test(nextYear)) return;
    setYear(nextYear);
    setYearDraft(nextYear);
  }

  return (
    <div className="annual-report">
      <header className="analysis-period-header year-header">
        <button className="icon-button" type="button" aria-label="Previous year" onClick={() => loadYear(String(Number(year) - 1).padStart(4, '0'))}><ChevronLeft aria-hidden="true" /></button>
        <div><p className="eyebrow">Annual Report</p><h2>{year} annual report</h2></div>
        <button className="icon-button" type="button" aria-label="Next year" onClick={() => loadYear(String(Number(year) + 1).padStart(4, '0'))}><ChevronRight aria-hidden="true" /></button>
      </header>
      <form className="year-picker" onSubmit={(event) => { event.preventDefault(); loadYear(yearDraft); }}>
        <label htmlFor="annual-year">Report year</label>
        <input id="annual-year" inputMode="numeric" pattern="\d{4}" value={yearDraft} onChange={(event) => setYearDraft(event.target.value)} />
        <button className="secondary-button" type="submit">Load year</button>
      </form>
      {current.error && <div className="page-state compact-state error" role="alert">{current.error}</div>}
      {!current.data && !current.error && <div className="page-state compact-state">Loading annual report…</div>}
      {current.data && (() => {
        const data = current.data;
        return (
        <>
          <dl className="annual-metrics">
            {[
              ['Annual income', data.summary.income], ['Annual spending', data.summary.spending],
              ['Annual savings', data.summary.savings], ['Annual amount left', data.summary.amountLeft],
            ].map(([label, value]) => <div className={value.startsWith('-') ? 'negative' : undefined} key={label}><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>)}
            <div className="annual-score"><dt>Budget Score</dt><dd>{data.summary.budgetScore}%</dd></div>
          </dl>
          <div className="annual-extrema">
            <p>Highest-spending month: {data.highestSpendingMonth ? formatMonth(data.highestSpendingMonth).split(' ')[0] : <strong>No activity recorded</strong>}</p>
            <p>Best-saving month: {data.bestSavingMonth ? formatMonth(data.bestSavingMonth).split(' ')[0] : <strong>No activity recorded</strong>}</p>
          </div>
          <div className="annual-chart-grid">
            <IncomeSpendingChart months={data.months} />
            <SavingsLineChart months={data.months} />
            <CategoryPieChart data={data.spendingByCategory} />
            <IncomeSourcePieChart data={data.incomeBySource} />
          </div>
        </>
        );
      })()}
    </div>
  );
}
