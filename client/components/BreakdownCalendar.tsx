import { useMemo, useState } from 'react';
import { CircleDollarSign, Repeat2, Vault as VaultIcon } from 'lucide-react';

import type { BudgetBreakdownData, CalendarDay } from '../../shared/contracts';
import { formatMoney, formatMonth } from '../format';
import { CategoryBadge } from './CategoryBadge';

interface BreakdownCalendarProps { month: string; days: BudgetBreakdownData['days']; }

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function calendarParts(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(0);
  first.setUTCHours(0, 0, 0, 0);
  first.setUTCFullYear(year, monthNumber - 1, 1);
  const next = new Date(first);
  next.setUTCFullYear(year, monthNumber, 1);
  const dayCount = Math.round((next.getTime() - first.getTime()) / 86_400_000);
  return { year, monthNumber, leading: (first.getUTCDay() + 6) % 7, dayCount };
}

function fullDateLabel(date: string): string {
  const [year, , day] = date.split('-');
  return `${Number(day)} ${formatMonth(date.slice(0, 7)).replace(` ${year}`, '')} ${year}`;
}

const emptyDay = (date: string): CalendarDay => ({
  date, income: '0.00', spending: '0.00', savings: '0.00', activity: [],
  vaultContributionCount: 0, subscriptionPaymentCount: 0,
});

export function BreakdownCalendar({ month, days }: BreakdownCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string>();
  const { year, monthNumber, leading, dayCount } = calendarParts(month);
  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const calendarDays = Array.from({ length: dayCount }, (_, index) => {
    const date = `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
    return dayMap.get(date) ?? emptyDay(date);
  });
  const selected = selectedDate ? dayMap.get(selectedDate) ?? emptyDay(selectedDate) : undefined;

  return (
    <>
      <div className="budget-calendar" role="grid" aria-label={`${formatMonth(month)} budget calendar`}>
        {weekdays.map((weekday) => <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
        {Array.from({ length: leading }, (_, index) => <div className="calendar-blank" role="gridcell" data-testid="calendar-blank" aria-hidden="true" key={`blank-${index}`} />)}
        {calendarDays.map((day) => {
          const fullDate = fullDateLabel(day.date);
          return (
            <div className="calendar-cell" role="gridcell" key={day.date}>
              <button
                className="calendar-day"
                type="button"
                aria-pressed={selectedDate === day.date}
                aria-label={`${fullDate}, income ${formatMoney(day.income)}, expenses ${formatMoney(day.spending)}, savings ${formatMoney(day.savings)}, ${day.vaultContributionCount} Vault contributions, ${day.subscriptionPaymentCount} subscriptions`}
                onClick={() => setSelectedDate(day.date)}
              >
                <strong>{Number(day.date.slice(-2))}</strong>
                <span className="calendar-income">+{formatMoney(day.income)}</span>
                <span className="calendar-expense">−{formatMoney(day.spending)}</span>
                {(day.vaultContributionCount > 0 || day.subscriptionPaymentCount > 0) && (
                  <span className="calendar-markers">
                    {day.vaultContributionCount > 0 && <span title="Vault contribution"><VaultIcon aria-hidden="true" />{day.vaultContributionCount}</span>}
                    {day.subscriptionPaymentCount > 0 && <span title="Subscription payments"><Repeat2 aria-hidden="true" />{day.subscriptionPaymentCount}</span>}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <section className="day-detail-panel insight-panel" role="region" aria-label={selected ? `${Number(selected.date.slice(-2))} ${formatMonth(selected.date.slice(0, 7)).split(' ')[0]} details` : 'Selected day details'}>
        {selected ? (
          <>
            <div className="section-heading"><div><p className="eyebrow">Calendar activity</p><h3>{Number(selected.date.slice(-2))} {formatMonth(selected.date.slice(0, 7)).split(' ')[0]} details</h3></div></div>
            <dl className="day-detail-totals">
              <div><dt>Income</dt><dd>{formatMoney(selected.income)}</dd></div>
              <div><dt>Expenses</dt><dd>{formatMoney(selected.spending)}</dd></div>
              <div><dt>Vault savings</dt><dd>{formatMoney(selected.savings)}</dd></div>
            </dl>
            {selected.activity.length === 0 ? <p className="compact-empty">No activity recorded.</p> : (
              <div className="day-detail-list">
                {selected.activity.map((item) => item.type === 'vault-contribution' ? (
                  <article className="day-detail-row vault-contribution" aria-label={`${item.vaultName} Vault contribution ${formatMoney(item.amount)}`} key={`${item.type}-${item.id}`}>
                    <span className="income-label"><VaultIcon aria-hidden="true" />Vault contribution</span>
                    <div><strong>{item.vaultEmoji && <span aria-hidden="true">{item.vaultEmoji} </span>}{item.vaultName}</strong><span>Vault savings</span></div>
                    <b>+{formatMoney(item.amount)}</b>
                  </article>
                ) : (
                  <article className={`day-detail-row ${item.type}`} key={`${item.type}-${item.id}`}>
                    {item.type === 'transaction' ? <CategoryBadge category={item.category} /> : <span className="income-label"><CircleDollarSign aria-hidden="true" />Income</span>}
                    <div><strong>{item.type === 'transaction' ? item.description : item.source}</strong><span>{item.type === 'transaction' ? 'Expense' : item.category}</span></div>
                    <b>{item.type === 'transaction' ? '−' : '+'}{formatMoney(item.amount)}</b>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : <p className="compact-empty">Choose a calendar day to inspect its activity.</p>}
      </section>
    </>
  );
}
