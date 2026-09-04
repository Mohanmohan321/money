import type { CategorySpend, MonthBudgetBreakdown, SpendingCategory } from '../../shared/contracts';
import { formatMoney, formatMonth } from '../format';
import { CategoryBadge } from './CategoryBadge';

const categoryColors: Record<SpendingCategory, string> = {
  food: '#d96d16', travel: '#3979ad', shopping: '#8056a5', coffee: '#825b43',
  entertainment: '#a84e70', health: '#27734f', bills: '#217a78', other: '#68746e',
};
const sourceColors = ['#217a78', '#c87927', '#8056a5', '#a84e70', '#3979ad', '#27734f', '#825b43', '#68746e'];

export function IncomeSpendingChart({ months }: { months: MonthBudgetBreakdown[] }) {
  const maximum = Math.max(1, ...months.flatMap((month) => [Number(month.income), Number(month.spending)]));
  return (
    <section className="report-chart-card">
      <h3>Income versus spending</h3>
      <svg className="annual-bar-chart" viewBox="0 0 720 260" role="img" aria-label="Monthly income versus spending chart">
        <line x1="38" y1="222" x2="710" y2="222" />
        {months.map((month, index) => {
          const incomeHeight = (Number(month.income) / maximum) * 180;
          const spendingHeight = (Number(month.spending) / maximum) * 180;
          const x = 50 + index * 55;
          return <g key={month.month}><rect className="income" x={x} y={222 - incomeHeight} width="16" height={incomeHeight} /><rect className="spending" x={x + 18} y={222 - spendingHeight} width="16" height={spendingHeight} /><text x={x + 17} y="244" textAnchor="middle">{formatMonth(month.month).slice(0, 3)}</text></g>;
        })}
      </svg>
      <div className="chart-key"><span className="income">Income</span><span className="spending">Spending</span></div>
      <div className="table-scroll"><table aria-label="Monthly income and spending data"><caption>Monthly income and spending data</caption><thead><tr><th>Month</th><th>Income</th><th>Spending</th></tr></thead><tbody>{months.map((month) => <tr key={month.month}><th scope="row">{formatMonth(month.month)}</th><td>{formatMoney(month.income)}</td><td>{formatMoney(month.spending)}</td></tr>)}</tbody></table></div>
    </section>
  );
}

export function SavingsLineChart({ months }: { months: MonthBudgetBreakdown[] }) {
  const maximum = Math.max(1, ...months.map((month) => Number(month.savings)));
  const points = months.map((month, index) => `${45 + index * 59},${218 - (Number(month.savings) / maximum) * 170}`).join(' ');
  return (
    <section className="report-chart-card">
      <h3>Savings trend</h3>
      <svg className="annual-line-chart" viewBox="0 0 720 260" role="img" aria-label="Monthly savings trend">
        <line x1="38" y1="222" x2="710" y2="222" />
        <polyline points={points} />
        {months.map((month, index) => <g key={month.month}><circle cx={45 + index * 59} cy={218 - (Number(month.savings) / maximum) * 170} r="5" /><text x={45 + index * 59} y="244" textAnchor="middle">{formatMonth(month.month).slice(0, 3)}</text></g>)}
      </svg>
      <div className="table-scroll"><table aria-label="Monthly savings data"><caption>Monthly savings data</caption><thead><tr><th>Month</th><th>Savings</th></tr></thead><tbody>{months.map((month) => <tr key={month.month}><th scope="row">{formatMonth(month.month)}</th><td>{formatMoney(month.savings)}</td></tr>)}</tbody></table></div>
    </section>
  );
}

interface PieDatum { label: string; amount: string; percentage: string; color: string; category?: SpendingCategory; }

function PieChart({ title, accessibleName, tableName, data }: { title: string; accessibleName: string; tableName: string; data: PieDatum[] }) {
  let start = 0;
  const segments = data.map((item) => {
    const end = start + Number(item.percentage);
    const segment = `${item.color} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  const hasData = data.some((item) => Number(item.percentage) > 0);
  return (
    <section className="report-chart-card pie-card">
      <h3>{title}</h3>
      <div className="pie-layout">
        <div className={`pie-chart${hasData ? '' : ' empty'}`} role="img" aria-label={accessibleName} style={hasData ? { background: `conic-gradient(${segments.join(', ')})` } : undefined}><span>{hasData ? title : 'No data'}</span></div>
        <ul className="pie-legend">{data.map((item) => <li key={item.label}><span className="legend-swatch" style={{ background: item.color }} />{item.category ? <CategoryBadge category={item.category} /> : <strong>{item.label}</strong>}<span>{item.percentage}% · {formatMoney(item.amount)}</span></li>)}</ul>
      </div>
      <div className="table-scroll"><table aria-label={tableName}><caption>{tableName}</caption><thead><tr><th>{title.includes('category') ? 'Category' : 'Source'}</th><th>Amount</th><th>Share</th></tr></thead><tbody>{data.length === 0 ? <tr><td colSpan={3}>No data</td></tr> : data.map((item) => <tr key={item.label}><th scope="row">{item.label}</th><td>{formatMoney(item.amount)}</td><td>{item.percentage}%</td></tr>)}</tbody></table></div>
    </section>
  );
}

export function CategoryPieChart({ data }: { data: CategorySpend[] }) {
  return <PieChart title="Spending by category" accessibleName="Spending by category pie chart" tableName="Spending by category data" data={data.map((item) => ({ ...item, label: item.category, color: categoryColors[item.category] }))} />;
}

export function IncomeSourcePieChart({ data }: { data: Array<{ source: string; amount: string; percentage: string }> }) {
  return <PieChart title="Income by source" accessibleName="Income by source pie chart" tableName="Income by source data" data={data.map((item, index) => ({ ...item, label: item.source, color: sourceColors[index % sourceColors.length] }))} />;
}
