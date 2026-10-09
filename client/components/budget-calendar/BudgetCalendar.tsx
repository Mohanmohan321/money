import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { BudgetCalendarDay, BudgetCalendarMonthView, BudgetCalendarReportSummary } from '../../../shared/budget-calendar';
import { formatMoney, formatMonth } from '../../format';

interface BudgetCalendarProps {
  view: BudgetCalendarMonthView;
  selectedDate?: string;
  week: BudgetCalendarReportSummary['week'];
  onMonthChange(month: string): void;
  onSelectDate(date: string): void;
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const absolute = year * 12 + monthNumber - 1 + delta;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = absolute - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

function leadingDays(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  return (weekday + 6) % 7;
}

function fullDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function monthDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function statusText(day: BudgetCalendarDay): string {
  if (day.status === 'future') return 'Future';
  if (day.recordState === 'missing') return 'Not recorded';
  if (day.status === 'over') return 'Over';
  if (day.status === 'on') return 'On budget';
  return 'Within';
}

function accessibleActual(day: BudgetCalendarDay): string {
  if (day.recordState === 'missing') return 'actual not recorded';
  if (day.recordState === 'recorded_zero') return 'actual 0.00 recorded';
  return `actual ${formatMoney(day.actualAmount)}`;
}

export function BudgetCalendar({
  view,
  selectedDate,
  week,
  onMonthChange,
  onSelectDate,
}: BudgetCalendarProps) {
  return (
    <div className="budget-calendar-workspace">
      <section className="budget-calendar-summary" aria-label={`${formatMonth(view.month)} budget overview`}>
        <div><span>Monthly budget</span><strong>₹{formatMoney(view.summary.monthlyBudget)}</strong></div>
        <div><span>Spent</span><strong>₹{formatMoney(view.summary.actualSpending)}</strong></div>
        <div className={view.summary.remaining.startsWith('-') ? 'negative' : ''}>
          <span>{view.summary.remaining.startsWith('-') ? 'Exceeded' : 'Remaining'}</span>
          <strong>₹{formatMoney(view.summary.remaining.replace(/^-/, ''))}</strong>
        </div>
        <div><span>Used</span><strong>{view.summary.utilization ?? '—'}%</strong></div>
      </section>
      <section className="budget-calendar-week-summary" aria-label={`${monthDay(week.from)}–${monthDay(week.to)} weekly budget`}>
        <div><span>Weekly plan</span><strong>₹{formatMoney(week.planned)}</strong></div>
        <div><span>Weekly spent</span><strong>₹{formatMoney(week.actual)}</strong></div>
        <div><span>{week.remaining.startsWith('-') ? 'Weekly over' : 'Weekly remaining'}</span><strong>₹{formatMoney(week.remaining.replace(/^-/, ''))}</strong></div>
      </section>

      <header className="budget-calendar-toolbar">
        <button className="icon-button" type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(view.month, -1))}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <div><p className="eyebrow">Monthly plan</p><h2>{formatMonth(view.month)}</h2></div>
        <div className="budget-calendar-toolbar-actions">
          <button className="secondary-button compact" type="button" onClick={() => {
            onMonthChange(view.today.slice(0, 7));
            onSelectDate(view.today);
          }}>Today</button>
          <button className="icon-button" type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(view.month, 1))}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="budget-calendar-legend" aria-label="Budget status legend">
        <span className="within">Within budget</span>
        <span className="over">Over budget</span>
        <span className="missing">Not recorded</span>
        <span className="future">Future</span>
      </div>

      <div className="budget-calendar-grid" role="grid" aria-label={`${formatMonth(view.month)} Budget Calendar`}>
        {weekdays.map((weekday) => <div className="budget-calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
        {Array.from({ length: leadingDays(view.month) }, (_, index) => (
          <div className="budget-calendar-blank" role="gridcell" aria-hidden="true" data-testid="budget-calendar-blank" key={`blank-${index}`} />
        ))}
        {view.days.map((day) => (
          <div className="budget-calendar-cell" role="gridcell" key={day.date}>
            <button
              type="button"
              className={`budget-calendar-day status-${day.status} record-${day.recordState}`}
              aria-pressed={selectedDate === day.date}
              aria-label={`${fullDate(day.date)}, planned ${formatMoney(day.plannedAmount)}, ${accessibleActual(day)}, ${day.status === 'over' ? 'over budget' : statusText(day).toLowerCase()}`}
              onClick={() => onSelectDate(day.date)}
            >
              <span className="budget-day-number">{Number(day.date.slice(-2))}</span>
              <span className="budget-day-plan">₹{formatMoney(day.plannedAmount)}</span>
              <span className="budget-day-status">{statusText(day)}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
