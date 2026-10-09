import type { BudgetMonthWorkspace } from '../../../shared/budget-workspace';
import { formatMoney } from '../../format';

export function BudgetTrends({ data }: { data: BudgetMonthWorkspace }) {
  const max = Math.max(1, ...data.days.flatMap((day) => [Number(day.planned), Number(day.actual)]));
  let cumulativePlanned = 0; let cumulativeActual = 0;
  return <div className="budget-trends">
    {Number(data.summary.actual) === 0 && <p className="budget-empty">No actual spending has been recorded for this month.</p>}
    <section className="budget-chart-card" role="region" aria-label="Planned versus actual spending"><h2>Planned vs actual</h2><div className="budget-day-bars" aria-hidden="true">{data.days.map((day) => <span key={day.date}><i style={{ height: `${Math.max(2, Number(day.planned) / max * 100)}%` }} /><b style={{ height: `${Math.max(day.recordState === 'missing' ? 0 : 2, Number(day.actual) / max * 100)}%` }} /></span>)}</div><table><caption>Daily planned and actual spending</caption><thead><tr><th>Date</th><th>Planned</th><th>Actual</th></tr></thead><tbody>{data.days.map((day) => <tr key={day.date}><td>{day.date}</td><td>₹{formatMoney(day.planned)}</td><td>{day.recordState === 'missing' ? 'Missing' : `₹${formatMoney(day.actual)}`}</td></tr>)}</tbody></table></section>
    <section className="budget-chart-card" aria-labelledby="category-chart"><h2 id="category-chart">Category breakdown</h2>{data.categoryTotals.length === 0 ? <p className="budget-empty">Categories will appear after expenses are recorded.</p> : <ul>{data.categoryTotals.map((item) => <li key={item.categoryId}><span>{item.name}</span><progress max="100" value={item.percentage} /><b>₹{formatMoney(item.amount)} · {item.percentage}%</b></li>)}</ul>}</section>
    <section className="budget-chart-card" aria-labelledby="weekly-chart"><h2 id="weekly-chart">Weekly comparison</h2><ul>{data.weeks.map((week) => <li key={week.from}><span>{week.from} – {week.to}</span><b>₹{formatMoney(week.actual)} / ₹{formatMoney(week.planned)}</b></li>)}</ul></section>
    <section className="budget-chart-card" aria-labelledby="cumulative-chart"><h2 id="cumulative-chart">Cumulative monthly trend</h2><table><caption>Cumulative planned and actual spending</caption><thead><tr><th>Date</th><th>Planned</th><th>Actual</th></tr></thead><tbody>{data.days.map((day) => { cumulativePlanned += Number(day.planned); cumulativeActual += Number(day.actual); return <tr key={day.date}><td>{day.date}</td><td>₹{formatMoney(cumulativePlanned.toFixed(2))}</td><td>₹{formatMoney(cumulativeActual.toFixed(2))}</td></tr>; })}</tbody></table></section>
  </div>;
}
