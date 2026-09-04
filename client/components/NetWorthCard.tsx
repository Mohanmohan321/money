import { useId } from 'react';

import type { NetWorthSummary } from '../../shared/contracts';
import { formatMoney } from '../format';

interface NetWorthCardProps {
  data: NetWorthSummary;
  onManage?: () => void;
}

const statusLabels: Record<NetWorthSummary['status'], string> = {
  positive: 'Positive',
  negative: 'Negative',
  zero: 'Zero',
};

export function NetWorthCard({ data, onManage }: NetWorthCardProps) {
  const headingId = useId();
  const owned = [
    ['Manual assets', data.manualAssets],
    ['Receivables', data.receivables],
    ['Total owned', data.totalOwned],
  ] as const;
  const owed = [
    ['Manual liabilities', data.manualLiabilities],
    ['Borrowed debt', data.borrowedDebt],
    ['Total owed', data.totalOwed],
  ] as const;

  return (
    <section className={`net-worth-card insight-panel ${data.status}`} aria-labelledby={headingId}>
      <div className="section-heading">
        <div><p className="eyebrow">Position</p><h2 id={headingId}>Net worth</h2></div>
        <span className="worth-status">{statusLabels[data.status]}</span>
      </div>
      <div className="net-worth-total">
        <span>Net worth</span>
        <strong>{formatMoney(data.netWorth)}</strong>
      </div>
      <div className="worth-columns">
        <dl>
          {owned.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>)}
        </dl>
        <dl>
          {owed.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>)}
        </dl>
      </div>
      {onManage && (
        <button className="secondary-button worth-manage-button" type="button" onClick={onManage}>
          Manage assets and liabilities
        </button>
      )}
    </section>
  );
}
