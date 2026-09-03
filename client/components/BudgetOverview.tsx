import { useId, useState } from 'react';

import type { MonthlyAnalysisData, UpsertBudgetInput } from '../../shared/contracts';
import { formatMoney, formatMonth } from '../format';

interface BudgetOverviewProps {
  data: MonthlyAnalysisData;
  onSave: (input: UpsertBudgetInput) => Promise<void>;
}

export function BudgetOverview({ data, onSave }: BudgetOverviewProps) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<UpsertBudgetInput>({
    salary: data.budget.salary,
    spendingLimit: data.budget.spendingLimit,
    savingsTarget: data.budget.savingsTarget,
  });

  function openEditor() {
    setDraft({
      salary: data.budget.salary,
      spendingLimit: data.budget.spendingLimit,
      savingsTarget: data.budget.savingsTarget,
    });
    setError('');
    setEditing(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Budget could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const metrics = [
    ['Income', data.summary.income],
    ['Spending', data.summary.spending],
    ['Savings', data.summary.savings],
    ['Amount left', data.summary.amountLeft],
  ] as const;
  const spendingStatus = data.summary.spendingRemaining.startsWith('-')
    ? 'Spending limit shortfall'
    : 'Spending limit left';

  return (
    <section className="budget-overview insight-panel" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{formatMonth(data.month)}</p>
          <h2 id={headingId}>Monthly budget</h2>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={openEditor}>
          Edit monthly budget
        </button>
      </div>

      <p className="budget-source">{data.budget.source === 'saved' ? 'Saved plan' : 'Suggested plan'}</p>

      <dl className="budget-plan-grid">
        <div><dt>Salary</dt><dd>{formatMoney(data.budget.salary)}</dd></div>
        <div><dt>Spending limit</dt><dd>{formatMoney(data.budget.spendingLimit)}</dd></div>
        <div><dt>Savings target</dt><dd>{formatMoney(data.budget.savingsTarget)}</dd></div>
      </dl>

      <dl className="budget-metric-grid">
        {metrics.map(([label, value]) => (
          <div key={label} className={value.startsWith('-') ? 'negative' : undefined}>
            <dt>{label}</dt>
            <dd>{formatMoney(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="budget-score-line">
        <div><span>Budget score</span><strong>{data.summary.budgetScore}%</strong></div>
        <div className={data.summary.spendingRemaining.startsWith('-') ? 'negative' : undefined}>
          <span>{spendingStatus}</span>
          <strong>{formatMoney(data.summary.spendingRemaining)}</strong>
        </div>
      </div>

      {editing && (
        <form className="budget-editor" aria-label="Edit monthly budget" onSubmit={save}>
          <label htmlFor="budget-salary">Monthly salary</label>
          <input
            id="budget-salary"
            inputMode="decimal"
            pattern="\d+(?:\.\d{1,2})?"
            required
            value={draft.salary}
            onChange={(event) => setDraft({ ...draft, salary: event.target.value })}
          />
          <label htmlFor="budget-spending-limit">Spending limit</label>
          <input
            id="budget-spending-limit"
            inputMode="decimal"
            pattern="\d+(?:\.\d{1,2})?"
            required
            value={draft.spendingLimit}
            onChange={(event) => setDraft({ ...draft, spendingLimit: event.target.value })}
          />
          <label htmlFor="budget-savings-target">Savings target</label>
          <input
            id="budget-savings-target"
            inputMode="decimal"
            pattern="\d+(?:\.\d{1,2})?"
            required
            value={draft.savingsTarget}
            onChange={(event) => setDraft({ ...draft, savingsTarget: event.target.value })}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving budget…' : 'Save budget'}
            </button>
            <button className="secondary-button" type="button" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
