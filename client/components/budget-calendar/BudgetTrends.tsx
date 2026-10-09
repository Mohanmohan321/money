import type {
  BudgetCalendarReportSummary,
  BudgetCalendarTrends as BudgetCalendarTrendsData,
} from '../../../shared/budget-calendar';
import { formatMoney } from '../../format';

interface BudgetTrendsProps {
  summary: BudgetCalendarReportSummary;
  trends: BudgetCalendarTrendsData;
}

function shortDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function compactDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function displayActual(item: BudgetCalendarTrendsData['daily'][number]): string {
  if (item.recordState === 'missing') return 'Not recorded';
  if (item.recordState === 'recorded_zero') return '₹0.00 recorded';
  return `₹${formatMoney(item.actual)}`;
}

export function BudgetTrends({ summary, trends }: BudgetTrendsProps) {
  const dailyMax = Math.max(1, ...trends.daily.flatMap((item) => [Number(item.planned), Number(item.actual)]));
  const weeklyMax = Math.max(1, ...trends.weeks.flatMap((item) => [Number(item.planned), Number(item.actual)]));
  const cumulativeMax = Math.max(1, ...trends.daily.flatMap((item) => [Number(item.cumulativePlanned), Number(item.cumulativeActual)]));
  const progressValue = summary.utilization === null
    ? 100
    : Math.min(100, Math.max(0, Number(summary.utilization)));
  let categoryOffset = 0;
  const palette = ['#217a78', '#c87927', '#9a4563', '#2e608d', '#704791', '#27734f'];
  const categoryGradient = trends.categories.length === 0
    ? '#dfe6e2'
    : `conic-gradient(${trends.categories.map((category, index) => {
      const start = categoryOffset;
      categoryOffset += Number(category.percentage);
      return `${palette[index % palette.length]} ${start}% ${categoryOffset}%`;
    }).join(', ')})`;
  const point = (value: string, index: number) => {
    const x = trends.daily.length <= 1 ? 50 : (index / (trends.daily.length - 1)) * 100;
    const y = 100 - (Number(value) / cumulativeMax) * 100;
    return `${x},${y}`;
  };

  return (
    <div className="budget-trends">
      <section className="trend-summary-grid" aria-label="Budget Calendar summary">
        <article><span>Monthly budget</span><strong>₹{formatMoney(summary.monthlyBudget)}</strong></article>
        <article><span>Actual spending</span><strong>₹{formatMoney(summary.actualSpending)}</strong></article>
        <article><span>{summary.remaining.startsWith('-') ? 'Exceeded' : 'Remaining'}</span><strong>₹{formatMoney(summary.remaining.replace(/^-/, ''))}</strong></article>
        <article><span>Recorded-day average</span><strong>₹{formatMoney(summary.recordedDayAverage)}</strong></article>
        <article><span>Days under budget</span><strong>{summary.underBudgetDays}</strong></article>
        <article><span>Days over budget</span><strong>{summary.overBudgetDays}</strong></article>
      </section>

      <section className="utilization-panel insight-panel" aria-labelledby="monthly-utilization-heading">
        <div className="section-heading"><div><p className="eyebrow">Monthly pace</p><h3 id="monthly-utilization-heading">Budget utilization</h3></div><strong>{summary.utilization ?? 'Over plan'}%</strong></div>
        <progress aria-label="Monthly budget utilization" aria-valuenow={Number(summary.utilization ?? 100)} max="100" value={progressValue} />
        {summary.projectedMonthEnd && <p>Projected month end · ₹{formatMoney(summary.projectedMonthEnd)} <span>Estimate based only on recorded elapsed days.</span></p>}
      </section>

      <section className="trend-chart-card" aria-labelledby="daily-trend-heading">
        <div className="section-heading"><div><p className="eyebrow">Daily comparison</p><h3 id="daily-trend-heading">Planned vs actual</h3></div></div>
        {trends.daily.length === 0 ? <p className="compact-empty">No daily plan is available for this month.</p> : (
          <div className="paired-bar-chart" role="img" aria-label="Planned versus actual spending by day">
            {trends.daily.map((item) => (
              <div className="paired-bar-group" key={item.date} title={`${shortDate(item.date)}: planned ₹${item.planned}, ${displayActual(item)}`}>
                <div className="paired-bars">
                  <span className="planned" style={{ height: `${Math.max(2, Number(item.planned) / dailyMax * 100)}%` }} />
                  <span className={`actual ${item.recordState}`} style={{ height: `${item.recordState === 'missing' ? 3 : Math.max(2, Number(item.actual) / dailyMax * 100)}%` }} />
                </div>
                <small>{Number(item.date.slice(-2))}</small>
              </div>
            ))}
          </div>
        )}
        <div className="table-scroll"><table aria-label="Daily planned and actual spending data"><thead><tr><th>Date</th><th>Planned</th><th>Actual</th></tr></thead><tbody>{trends.daily.map((item) => <tr key={item.date}><th>{shortDate(item.date)}</th><td>₹{formatMoney(item.planned)}</td><td>{displayActual(item)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="trend-chart-card category-trend-card" aria-labelledby="category-trend-heading">
        <div className="section-heading"><div><p className="eyebrow">Where it went</p><h3 id="category-trend-heading">Category spending</h3></div></div>
        <div className="category-donut" role="img" aria-label="Spending by category" style={{ background: categoryGradient }}><span>₹{formatMoney(summary.actualSpending)}</span></div>
        {trends.categories.length === 0 && <p className="compact-empty">No category spending has been recorded.</p>}
        <div className="table-scroll"><table aria-label="Category spending data"><thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead><tbody>{trends.categories.map((category) => <tr key={category.categoryId}><th>{category.name}</th><td>₹{formatMoney(category.amount)}</td><td>{category.percentage}%</td></tr>)}</tbody></table></div>
      </section>

      <section className="trend-chart-card" aria-labelledby="weekly-trend-heading">
        <div className="section-heading"><div><p className="eyebrow">Week by week</p><h3 id="weekly-trend-heading">Weekly comparison</h3></div></div>
        <div className="weekly-bar-chart" role="img" aria-label="Weekly planned versus actual spending">
          {trends.weeks.map((week) => (
            <div key={week.from}><div className="weekly-bars"><span className="planned" style={{ height: `${Math.max(2, Number(week.planned) / weeklyMax * 100)}%` }} /><span className="actual" style={{ height: `${Math.max(2, Number(week.actual) / weeklyMax * 100)}%` }} /></div><small>{compactDate(week.from)}</small></div>
          ))}
        </div>
        <div className="table-scroll"><table aria-label="Weekly planned and actual spending data"><thead><tr><th>Week</th><th>Planned</th><th>Actual</th></tr></thead><tbody>{trends.weeks.map((week) => <tr key={week.from}><th>{shortDate(week.from)}–{shortDate(week.to)}{week.from.slice(0, 7) !== week.to.slice(0, 7) && <small> · month portion</small>}</th><td>₹{formatMoney(week.planned)}</td><td>₹{formatMoney(week.actual)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="trend-chart-card" aria-labelledby="cumulative-trend-heading">
        <div className="section-heading"><div><p className="eyebrow">Monthly trajectory</p><h3 id="cumulative-trend-heading">Cumulative plan</h3></div></div>
        <svg className="cumulative-chart" role="img" aria-label="Cumulative planned and actual spending" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline className="planned" points={trends.daily.map((item, index) => point(item.cumulativePlanned, index)).join(' ')} />
          <polyline className="actual" points={trends.daily.map((item, index) => point(item.cumulativeActual, index)).join(' ')} />
        </svg>
      </section>
    </div>
  );
}
