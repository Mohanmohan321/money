import type { CSSProperties } from 'react';
import Decimal from 'decimal.js';

import type { MovementPoint } from '../../shared/contracts';

interface MovementChartProps {
  points: MovementPoint[];
  compact?: boolean;
}

function barHeight(amount: string, maximum: Decimal): string {
  if (maximum.isZero()) return '0%';
  return `${new Decimal(amount).div(maximum).mul(100).toDecimalPlaces(2).toString()}%`;
}

function shortDate(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(5);
  return date;
}

export function MovementChart({ points, compact = false }: MovementChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">No movement in this period.</div>;
  }
  const values = points.flatMap((point) => [
    new Decimal(point.transactionAmount),
    new Decimal(point.lentAmount),
    new Decimal(point.borrowedAmount),
  ]);
  const maximum = Decimal.max(...values, new Decimal(0));

  return (
    <div className={`movement-chart${compact ? ' compact' : ''}`} role="img" aria-label="Transactions, money lent, and money borrowed over time">
      <div className="chart-plot">
        {points.map((point) => (
          <div className="chart-day" key={point.date}>
            <div className="chart-bars">
              <span className="chart-bar transaction" style={{ '--bar-height': barHeight(point.transactionAmount, maximum) } as CSSProperties} aria-label={`${point.date}: transactions ${point.transactionAmount}`} />
              <span className="chart-bar lent" style={{ '--bar-height': barHeight(point.lentAmount, maximum) } as CSSProperties} aria-label={`${point.date}: lent ${point.lentAmount}`} />
              <span className="chart-bar borrowed" style={{ '--bar-height': barHeight(point.borrowedAmount, maximum) } as CSSProperties} aria-label={`${point.date}: borrowed ${point.borrowedAmount}`} />
            </div>
            <span className="chart-date">{shortDate(point.date)}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend" aria-hidden="true">
        <span className="transaction">Transactions</span>
        <span className="lent">Lent</span>
        <span className="borrowed">Borrowed</span>
      </div>
    </div>
  );
}
