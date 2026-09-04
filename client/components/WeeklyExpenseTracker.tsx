import { useState } from 'react';
import { ChevronLeft, ChevronRight, CircleDollarSign } from 'lucide-react';

import type { DailyBudgetPoint } from '../../shared/contracts';
import { formatMoney } from '../format';
import { CategoryBadge } from './CategoryBadge';

interface WeeklyExpenseTrackerProps {
  days: DailyBudgetPoint[];
  weekFrom: string;
  weekTo: string;
  onPreviousWeek(): void;
  onNextWeek(): void;
}

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function shortDate(value: string): string {
  const [, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, month - 1, day)));
}

function longDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

export function WeeklyExpenseTracker({ days, weekFrom, weekTo, onPreviousWeek, onNextWeek }: WeeklyExpenseTrackerProps) {
  const [expandedDate, setExpandedDate] = useState<string>();
  const maxSpending = Math.max(0, ...days.map(({ spending }) => Number(spending)));

  return (
    <section className="weekly-tracker insight-panel" aria-label="Weekly expense tracker">
      <div className="section-heading tracker-heading">
        <div><p className="eyebrow">{shortDate(weekFrom)} — {shortDate(weekTo)}</p><h3>Weekly expense tracker</h3></div>
        <div className="period-controls">
          <button className="icon-button subtle" type="button" aria-label="Previous week" onClick={onPreviousWeek}><ChevronLeft aria-hidden="true" /></button>
          <button className="icon-button subtle" type="button" aria-label="Next week" onClick={onNextWeek}><ChevronRight aria-hidden="true" /></button>
        </div>
      </div>
      <ol className={`week-bars${maxSpending === 0 ? ' zero' : ''}`}>
        {days.map((day, index) => {
          const height = maxSpending === 0 ? 0 : (Number(day.spending) / maxSpending) * 100;
          const expanded = expandedDate === day.date;
          return (
            <li key={day.date}>
              <button
                className="week-day"
                type="button"
                aria-expanded={expanded}
                aria-label={`${dayNames[index]} ${longDate(day.date)}, expenses ${formatMoney(day.spending)}`}
                onClick={() => setExpandedDate(expanded ? undefined : day.date)}
              >
                <span className="week-bar-slot" aria-hidden="true"><span className="week-bar-fill" style={{ height: `${height}%` }} /></span>
                <strong>{formatMoney(day.spending)}</strong>
                <span>{dayNames[index]}</span>
                <small>{shortDate(day.date)}</small>
              </button>
              {expanded && (
                <div className="day-activity">
                  {day.activity.length === 0 ? <p>No activity recorded.</p> : day.activity.map((item) => (
                    <div className={`day-activity-row ${item.type}`} key={`${item.type}-${item.id}`}>
                      {item.type === 'transaction' ? <CategoryBadge category={item.category} /> : <span className="income-label"><CircleDollarSign aria-hidden="true" />Income</span>}
                      <span>{item.type === 'transaction' ? item.description : item.source}</span>
                      <strong>{item.type === 'transaction' ? '−' : '+'}{formatMoney(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
