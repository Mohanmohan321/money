import { useId } from 'react';
import { CircleDollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { IncomeCategory, RecentActivity as RecentActivityItem } from '../../shared/contracts';
import { formatMoney } from '../format';
import { CategoryBadge } from './CategoryBadge';

interface RecentActivityProps {
  items: RecentActivityItem[];
}

const incomeCategoryLabels: Record<IncomeCategory, string> = {
  bonus: 'Bonus',
  freelance: 'Freelance',
  refund: 'Refund',
  other: 'Other',
};

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(value));
}

export function RecentActivity({ items }: RecentActivityProps) {
  const headingId = useId();
  const visibleItems = items.slice(0, 5);

  return (
    <section className="recent-activity insight-panel" aria-labelledby={headingId}>
      <div className="section-heading">
        <div><p className="eyebrow">Latest movement</p><h2 id={headingId}>Recent transactions</h2></div>
        <Link className="text-link" to="/history">See all</Link>
      </div>
      {visibleItems.length === 0 ? (
        <p className="compact-empty">No income or spending recorded this month.</p>
      ) : (
        <div className="history-list">
          {visibleItems.map((item) => item.type === 'transaction' ? (
            <article className="history-item transaction" key={`transaction-${item.id}`}>
              <div className="activity-category"><CategoryBadge category={item.category} /></div>
              <div>
                <strong>{item.description}</strong>
                <span>Spending · <time dateTime={item.createdAt}>{formatActivityDate(item.createdAt)}</time></span>
              </div>
              <b>−{formatMoney(item.amount)}</b>
            </article>
          ) : (
            <article className="history-item income" key={`income-${item.id}`}>
              <span className="history-icon income-icon"><CircleDollarSign aria-hidden="true" focusable="false" /></span>
              <div>
                <strong>{item.source}</strong>
                <span>Income · {incomeCategoryLabels[item.category]} · <time dateTime={item.createdAt}>{formatActivityDate(item.createdAt)}</time></span>
              </div>
              <b>+{formatMoney(item.amount)}</b>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
