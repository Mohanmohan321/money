import Decimal from 'decimal.js';
import { FormEvent, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type {
  BudgetCalendarCategory,
  BudgetCalendarFrequency,
  BudgetCalendarMonthCategory,
  BudgetCalendarRule,
  BudgetCalendarSettings,
} from '../../../shared/budget-calendar';
import { api, ApiError } from '../../api';
import { formatMoney, formatMonth } from '../../format';

interface BudgetConfigurationProps {
  month: string;
  section: 'categories' | 'rules';
  onMutationComplete(): void;
}

const groups = ['grocery', 'meal', 'petrol', 'snacks', 'miscellaneous', 'other'] as const;
const weekdays = [
  [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'],
  [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday'],
] as const;

function moneyTotal(items: BudgetCalendarMonthCategory[], predicate: (item: BudgetCalendarMonthCategory) => boolean) {
  return items.filter(predicate).reduce((total, item) => total.plus(item.monthlyAmount || 0), new Decimal(0)).toFixed(2);
}

function datePreview(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

export function BudgetConfiguration({ month, section, onMutationComplete }: BudgetConfigurationProps) {
  const [categories, setCategories] = useState<BudgetCalendarCategory[]>([]);
  const [monthCategories, setMonthCategories] = useState<BudgetCalendarMonthCategory[]>([]);
  const [overallLimit, setOverallLimit] = useState('');
  const [settings, setSettings] = useState<BudgetCalendarSettings>();
  const [rules, setRules] = useState<BudgetCalendarRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<(typeof groups)[number]>('other');
  const [newAmount, setNewAmount] = useState('');

  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleFrequency, setRuleFrequency] = useState<BudgetCalendarFrequency>('daily');
  const [ruleAmount, setRuleAmount] = useState('');
  const [ruleWeekdays, setRuleWeekdays] = useState<number[]>([]);
  const [ruleDay, setRuleDay] = useState('1');
  const [ruleFrom, setRuleFrom] = useState('');
  const [ruleTo, setRuleTo] = useState('');

  const [overrideDate, setOverrideDate] = useState('');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideNote, setOverrideNote] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [monthData, categoryData, settingsData, ruleData] = await Promise.all([
        api.budgetCalendarMonth(month),
        api.budgetCalendarCategories(true),
        api.budgetCalendarSettings(),
        api.budgetCalendarRules(),
      ]);
      setOverallLimit(monthData.overallLimit);
      setMonthCategories(monthData.categories);
      setCategories(categoryData.items);
      setSettings(settingsData);
      setRules(ruleData.items);
      setRuleCategory((current) => current || categoryData.items.find(({ active }) => active)?.id || '');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Budget configuration could not be loaded');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [month]);

  const allocated = moneyTotal(monthCategories, (item) => item.includedInOverallBudget);
  const groceries = moneyTotal(monthCategories, (item) => item.group === 'grocery' && item.includedInOverallBudget);
  const meals = moneyTotal(monthCategories, (item) => item.group === 'meal' && item.includedInOverallBudget);
  const weeklyFoodTargetValue = /^\d+(?:\.\d{0,2})?$/.test(settings?.weeklyFoodTarget ?? '')
    ? new Decimal(settings!.weeklyFoodTarget)
    : new Decimal(0);
  const weeklyFoodTargetDisplay = weeklyFoodTargetValue.toFixed(2);
  const fourWeekTarget = weeklyFoodTargetValue.times(4);
  const discrepancy = fourWeekTarget.minus(meals);

  function updateMonthCategory(id: string, changes: Partial<BudgetCalendarMonthCategory>) {
    setMonthCategories((items) => items.map((item) => item.categoryId === id ? { ...item, ...changes } : item));
  }

  async function saveMonth(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.saveBudgetCalendarMonth(month, { overallLimit, categories: monthCategories });
      setMessage(`${formatMonth(month)} allocation saved`);
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Month allocation could not be saved');
    }
  }

  async function saveCategory(category: BudgetCalendarCategory) {
    const snapshot = monthCategories.find((item) => item.categoryId === category.id);
    if (!snapshot) return;
    setError('');
    try {
      await api.updateBudgetCalendarCategory(category.id, {
        name: snapshot.name,
        group: snapshot.group,
        monthlyAmount: snapshot.monthlyAmount,
        includedInOverallBudget: snapshot.includedInOverallBudget,
        sortOrder: snapshot.sortOrder,
        active: category.active,
      });
      setMessage(`${snapshot.name} defaults updated`);
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Category could not be updated');
    }
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const created = await api.createBudgetCalendarCategory({
        name: newName, group: newGroup, monthlyAmount: newAmount,
        includedInOverallBudget: true,
      });
      setCategories((current) => [...current, created]);
      setMonthCategories((current) => [...current, {
        categoryId: created.id,
        name: created.name,
        group: created.group,
        monthlyAmount: created.monthlyAmount,
        includedInOverallBudget: created.includedInOverallBudget,
        sortOrder: created.sortOrder,
      }]);
      setNewName('');
      setNewAmount('');
      setMessage('Category added to this month draft. Save the allocation to apply it.');
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Category could not be added');
    }
  }

  async function archiveCategory(category: BudgetCalendarCategory) {
    if (!window.confirm(`Remove ${category.name} from future planning?`)) return;
    setError('');
    try {
      await api.deleteBudgetCalendarCategory(category.id);
      setMessage(`${category.name} removed from future planning`);
      await load();
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Category could not be removed');
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError('');
    try {
      const saved = await api.updateBudgetCalendarSettings({
        weekStart: settings.weekStart,
        weeklyFoodTarget: settings.weeklyFoodTarget,
      });
      setSettings(saved);
      setMessage('Planning settings saved');
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Planning settings could not be saved');
    }
  }

  async function addRule(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.createBudgetCalendarRule({
        categoryId: ruleCategory,
        frequency: ruleFrequency,
        amount: ruleAmount,
        weekdays: ruleFrequency === 'weekly' || ruleFrequency === 'specific_days' ? ruleWeekdays : [],
        ...(ruleFrequency === 'monthly' ? { dayOfMonth: Number(ruleDay) } : {}),
        ...(ruleFrom ? { activeFrom: ruleFrom } : {}),
        ...(ruleTo ? { activeTo: ruleTo } : {}),
      });
      setRuleAmount('');
      setMessage('Planning rule added');
      await load();
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Planning rule could not be added');
    }
  }

  async function deleteRule(rule: BudgetCalendarRule) {
    if (!window.confirm('Delete this planning rule?')) return;
    try {
      await api.deleteBudgetCalendarRule(rule.id);
      setRules((items) => items.filter(({ id }) => id !== rule.id));
      setMessage('Planning rule deleted');
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Planning rule could not be deleted');
    }
  }

  async function saveOverride(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.saveBudgetCalendarOverride(overrideDate, {
        plannedAmount: overrideAmount,
        ...(overrideNote.trim() ? { note: overrideNote } : {}),
      });
      setMessage(`${datePreview(overrideDate)} override saved`);
      onMutationComplete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Date override could not be saved');
    }
  }

  if (loading) return <div className="page-state compact-state">Loading budget configuration…</div>;
  if (!settings) return <div className="page-state compact-state error" role="alert">{error || 'Budget configuration is unavailable'}</div>;

  return (
    <div className="budget-configuration">
      {error && <div className="form-message error" role="alert">{error}</div>}
      {message && <div className="form-message success" role="status">{message}</div>}

      {section === 'categories' ? (
        <>
          <section className="configuration-summary" aria-label="Allocation totals">
            <strong>₹{formatMoney(allocated)} allocated</strong>
            <span>Groceries ₹{formatMoney(groceries)}</span>
            <span>Meals ₹{formatMoney(meals)}</span>
          </section>
          <form className="allocation-form" aria-label={`${formatMonth(month)} allocation`} onSubmit={saveMonth}>
            <label htmlFor="budget-overall-limit">Overall monthly spending limit</label>
            <input id="budget-overall-limit" inputMode="decimal" value={overallLimit} onChange={(event) => setOverallLimit(event.target.value)} required />
            <div className="allocation-list">
              {monthCategories.map((item) => {
                const category = categories.find(({ id }) => id === item.categoryId);
                return (
                  <article key={item.categoryId}>
                    <div className="allocation-title"><strong>{item.name}</strong><span>{item.group}</span></div>
                    <label>
                      <span>Monthly amount for {item.name}</span>
                      <input aria-label={`Monthly amount for ${item.name}`} inputMode="decimal" value={item.monthlyAmount} onChange={(event) => updateMonthCategory(item.categoryId, { monthlyAmount: event.target.value })} />
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={item.includedInOverallBudget} onChange={(event) => updateMonthCategory(item.categoryId, { includedInOverallBudget: event.target.checked })} />
                      Include in overall budget
                    </label>
                    {category && <div className="allocation-actions">
                      <button className="text-button" type="button" onClick={() => void saveCategory(category)}>Update default</button>
                      <button className="text-button danger" type="button" aria-label={`Remove ${item.name}`} onClick={() => void archiveCategory(category)}><Trash2 aria-hidden="true" />Remove</button>
                    </div>}
                  </article>
                );
              })}
            </div>
            <button className="primary-button" type="submit">Save {formatMonth(month).split(' ')[0]} allocation</button>
          </form>
          <form className="add-category-form insight-panel" aria-label="Add budget category" onSubmit={addCategory}>
            <div className="section-heading"><div><p className="eyebrow">Future planning</p><h3>Add category</h3></div></div>
            <label htmlFor="new-budget-category">Category name</label>
            <input id="new-budget-category" value={newName} onChange={(event) => setNewName(event.target.value)} required />
            <label htmlFor="new-budget-group">Group</label>
            <select id="new-budget-group" value={newGroup} onChange={(event) => setNewGroup(event.target.value as typeof newGroup)}>
              {groups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <label htmlFor="new-budget-amount">Monthly amount</label>
            <input id="new-budget-amount" inputMode="decimal" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} required />
            <button className="secondary-button" type="submit"><Plus aria-hidden="true" />Add category</button>
          </form>
        </>
      ) : (
        <>
          <section className="section-heading"><div><p className="eyebrow">Automatic allocation</p><h3>Planning rules</h3></div></section>
          {discrepancy.eq(0) ? (
            <div className="planning-note">The four-week food target matches the monthly meal allocation.</div>
          ) : (
            <div className="planning-note warning" role="alert">
              Weekly food target ₹{formatMoney(weeklyFoodTargetDisplay)} equals ₹{formatMoney(fourWeekTarget.toFixed(2))} over four weeks and does not match the meal allocation ₹{formatMoney(meals)}. Both values remain independent.
            </div>
          )}
          <form className="planning-settings-form insight-panel" aria-label="Planning settings" onSubmit={saveSettings}>
            <label htmlFor="budget-week-start">Week starts on</label>
            <select id="budget-week-start" value={settings.weekStart} onChange={(event) => setSettings({ ...settings, weekStart: Number(event.target.value) })}>
              {weekdays.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <label htmlFor="weekly-food-target">Weekly food target</label>
            <input id="weekly-food-target" inputMode="decimal" value={settings.weeklyFoodTarget} onChange={(event) => setSettings({ ...settings, weeklyFoodTarget: event.target.value })} />
            <button className="primary-button" type="submit">Save planning settings</button>
          </form>

          <form className="rule-form insight-panel" aria-label="Add planning rule" onSubmit={addRule}>
            <h3>Add recurring allocation</h3>
            <label htmlFor="rule-category">Category</label>
            <select id="rule-category" value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)}>
              {categories.filter(({ active }) => active).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
            <label htmlFor="rule-frequency">Frequency</label>
            <select id="rule-frequency" value={ruleFrequency} onChange={(event) => setRuleFrequency(event.target.value as BudgetCalendarFrequency)}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option>
              <option value="specific_days">Specific weekdays</option><option value="monthly">Monthly</option>
            </select>
            <label htmlFor="rule-amount">Planned amount per occurrence</label>
            <input id="rule-amount" inputMode="decimal" value={ruleAmount} onChange={(event) => setRuleAmount(event.target.value)} required />
            {(ruleFrequency === 'weekly' || ruleFrequency === 'specific_days') && (
              <fieldset><legend>Scheduled weekdays</legend>{weekdays.map(([value, label]) => (
                <label className="checkbox-label" key={value}><input type="checkbox" checked={ruleWeekdays.includes(value)} onChange={(event) => setRuleWeekdays((items) => event.target.checked ? [...items, value] : items.filter((item) => item !== value))} />{label}</label>
              ))}</fieldset>
            )}
            {ruleFrequency === 'monthly' && <><label htmlFor="rule-day">Day of month</label><input id="rule-day" type="number" min="1" max="31" value={ruleDay} onChange={(event) => setRuleDay(event.target.value)} /></>}
            <div className="rule-date-range"><label>Active from <input type="date" value={ruleFrom} onChange={(event) => setRuleFrom(event.target.value)} /></label><label>Active to <input type="date" value={ruleTo} onChange={(event) => setRuleTo(event.target.value)} /></label></div>
            <button className="secondary-button" type="submit">Add planning rule</button>
          </form>

          {rules.length > 0 && <div className="rule-list">{rules.map((rule) => (
            <article key={rule.id}><div><strong>{categories.find(({ id }) => id === rule.categoryId)?.name ?? 'Archived category'}</strong><span>{rule.frequency.replace('_', ' ')} · ₹{formatMoney(rule.amount)}</span></div><button className="icon-button subtle" type="button" aria-label="Delete planning rule" onClick={() => void deleteRule(rule)}><Trash2 aria-hidden="true" /></button></article>
          ))}</div>}

          <form className="override-form insight-panel" aria-label="Date-specific override" onSubmit={saveOverride}>
            <h3>Date-specific planned amount</h3>
            <label htmlFor="override-date">Override date</label>
            <input id="override-date" type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} required />
            <label htmlFor="override-amount">Override planned amount</label>
            <input id="override-amount" inputMode="decimal" value={overrideAmount} onChange={(event) => setOverrideAmount(event.target.value)} required />
            <label htmlFor="override-note">Override note</label>
            <input id="override-note" value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} maxLength={500} />
            {overrideDate && overrideAmount && <p className="override-preview">{datePreview(overrideDate)} will use ₹{formatMoney(new Decimal(overrideAmount).toFixed(2))} instead of its calculated plan.</p>}
            <button className="primary-button" type="submit">Save date override</button>
          </form>
        </>
      )}
    </div>
  );
}
