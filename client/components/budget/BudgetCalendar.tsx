import type { BudgetDay } from '../../../shared/budget-workspace';
import { formatMoney, formatMonth } from '../../format';

function fullDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function BudgetCalendar({ month, days, selectedDate, onSelect }: { month: string; days: BudgetDay[]; selectedDate?: string; onSelect(date: string): void }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const leading = (sundayFirst + 6) % 7;
  return (
    <div className="budget-workspace-calendar" role="grid" aria-label={`${formatMonth(month)} budget calendar`}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <div role="columnheader" className="budget-weekday" key={`${label}-${index}`}>{label}</div>)}
      {Array.from({ length: leading }, (_, index) => <div role="gridcell" aria-hidden="true" className="budget-calendar-blank" key={index} />)}
      {days.map((day) => {
        const recorded = day.recordState !== 'missing';
        const statusLabel = day.status === 'future' ? 'future date' : day.status === 'missing' ? 'no spending recorded' : day.status === 'over' ? 'over budget' : 'within budget';
        return <div role="gridcell" className="budget-calendar-cell" key={day.date}>
          <button type="button" className={`budget-calendar-date status-${day.status}`} aria-pressed={selectedDate === day.date}
            aria-label={`${fullDate(day.date)}, planned ₹${formatMoney(day.planned)}, ${recorded ? `actual ₹${formatMoney(day.actual)}` : 'no actual recorded'}, ${statusLabel}`}
            onClick={() => onSelect(day.date)}>
            <strong>{Number(day.date.slice(-2))}</strong><span>₹{formatMoney(day.planned)}</span>
            <i aria-hidden="true">{recorded ? `₹${formatMoney(day.actual)}` : '—'}</i>
          </button>
        </div>;
      })}
    </div>
  );
}
