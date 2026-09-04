import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, CalendarDays, Pencil, Plus } from 'lucide-react';

import type { CreateVaultInput, UpdateVaultInput, Vault } from '../../shared/contracts';
import { api } from '../api';
import { formatMoney } from '../format';

interface VaultGoalsProps {
  vaults: Vault[];
  onRefresh: () => Promise<void>;
  onContributionRefresh?: () => Promise<void>;
}

interface VaultDraft {
  name: string;
  emoji: string;
  targetAmount: string;
  targetDate: string;
}

const emptyDraft: VaultDraft = { name: '', emoji: '', targetAmount: '', targetDate: '' };

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function payloadFromDraft(draft: VaultDraft): CreateVaultInput {
  return {
    name: draft.name,
    emoji: draft.emoji,
    targetAmount: draft.targetAmount,
    ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
  };
}

function formatTargetDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function VaultGoals({ vaults, onRefresh, onContributionRefresh }: VaultGoalsProps) {
  const headingId = useId();
  const mounted = useRef(true);
  const actionLocks = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [successfulActions, setSuccessfulActions] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshNotice, setRefreshNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<VaultDraft>(emptyDraft);
  const [contributingTo, setContributingTo] = useState<string>();
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string>();
  const [editDraft, setEditDraft] = useState<VaultDraft>(emptyDraft);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const activeVaults = [...vaults]
    .filter((vault) => vault.status === 'active' || vault.isGeneral)
    .sort((left, right) => Number(right.isGeneral) - Number(left.isGeneral));
  const archivedVaults = vaults.filter((vault) => vault.status === 'archived' && !vault.isGeneral);

  function setActionError(key: string, message: string) {
    if (!mounted.current) return;
    setErrors((current) => ({ ...current, [key]: message }));
  }

  async function runAction(key: string, action: () => Promise<void>, fallback: string) {
    if (actionLocks.current.has(key)) return;
    actionLocks.current.add(key);
    setPending((current) => new Set(current).add(key));
    setActionError(key, '');
    if (mounted.current) setRefreshNotice('');
    try {
      await action();
    } catch (caught) {
      setActionError(key, errorMessage(caught, fallback));
    } finally {
      actionLocks.current.delete(key);
      if (mounted.current) {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    }
  }

  async function refreshAfterMutation(refresh: () => Promise<void>, successMessage: string) {
    try {
      await refresh();
    } catch {
      if (mounted.current) setRefreshNotice(`${successMessage}; refresh failed. Use Refresh to update this view.`);
    }
  }

  function openCreate() {
    setCreateDraft(emptyDraft);
    setActionError('create', '');
    setCreating(true);
  }

  function createVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('create', async () => {
      await api.createVault(payloadFromDraft(createDraft));
      if (mounted.current) {
        setCreateDraft(emptyDraft);
        setCreating(false);
      }
      await refreshAfterMutation(onRefresh, 'Vault saved successfully');
    }, 'Vault could not be created. Try again.');
  }

  function openContribution(vault: Vault) {
    setActionError(`contribute:${vault.id}`, '');
    setContributionAmounts((current) => ({ ...current, [vault.id]: '' }));
    setContributingTo(vault.id);
  }

  function contribute(event: FormEvent<HTMLFormElement>, vault: Vault) {
    event.preventDefault();
    const key = `contribute:${vault.id}`;
    void runAction(key, async () => {
      await api.contributeToVault(vault.id, { amount: contributionAmounts[vault.id] ?? '' });
      if (mounted.current) {
        setContributionAmounts((current) => ({ ...current, [vault.id]: '' }));
        setContributingTo((current) => current === vault.id ? undefined : current);
      }
      await refreshAfterMutation(onContributionRefresh ?? onRefresh, `Money added successfully to ${vault.name}`);
    }, `Money could not be added to ${vault.name}. Try again.`);
  }

  function openEditor(vault: Vault) {
    setActionError(`update:${vault.id}`, '');
    setEditDraft({
      name: vault.name,
      emoji: vault.emoji,
      targetAmount: vault.targetAmount,
      targetDate: vault.targetDate ?? '',
    });
    setEditingId(vault.id);
  }

  function updateVault(event: FormEvent<HTMLFormElement>, vault: Vault) {
    event.preventDefault();
    const key = `update:${vault.id}`;
    const input: UpdateVaultInput = payloadFromDraft({
      ...editDraft,
      name: vault.isGeneral ? vault.name : editDraft.name,
      emoji: vault.isGeneral ? vault.emoji : editDraft.emoji,
    });
    void runAction(key, async () => {
      await api.updateVault(vault.id, input);
      if (mounted.current) setEditingId((current) => current === vault.id ? undefined : current);
      await refreshAfterMutation(onRefresh, `${vault.name} saved successfully`);
    }, `${vault.name} could not be updated. Try again.`);
  }

  function archiveVault(vault: Vault) {
    const key = `archive:${vault.id}`;
    void runAction(key, async () => {
      await api.archiveVault(vault.id);
      if (mounted.current) setSuccessfulActions((current) => new Set(current).add(key));
      await refreshAfterMutation(onRefresh, `${vault.name} archived successfully`);
    }, `${vault.name} could not be archived. Try again.`);
  }

  function renderVault(vault: Vault, archivedView = false) {
    const contributionKey = `contribute:${vault.id}`;
    const updateKey = `update:${vault.id}`;
    const archiveKey = `archive:${vault.id}`;
    return (
      <article className={`vault-card${vault.isGeneral ? ' general' : ''}${archivedView ? ' archived' : ''}`} key={vault.id}>
        <header className="vault-card-header">
          <span className="vault-emoji" aria-hidden="true">{vault.emoji}</span>
          <div>
            <h3>{vault.name}</h3>
            <p>{vault.isGeneral ? 'Open-ended savings' : archivedView ? 'Archived goal' : 'Savings goal'}</p>
          </div>
        </header>

        <div className="vault-saved">
          <span>Saved</span>
          <strong>{formatMoney(vault.savedAmount)}</strong>
        </div>

        {!vault.isGeneral && (
          <div className="vault-progress-block">
            <div className="vault-progress-copy">
              <span>Target {formatMoney(vault.targetAmount)}</span>
              <strong>{vault.progressPercent}%</strong>
            </div>
            <progress aria-label={`${vault.name} progress`} max="100" value={vault.progressPercent} />
            {vault.targetDate && (
              <p className="vault-date">
                <CalendarDays aria-hidden="true" />
                <time dateTime={vault.targetDate}>{formatTargetDate(vault.targetDate)}</time>
              </p>
            )}
          </div>
        )}

        {!archivedView && (
          <div className="vault-actions">
            <button
              aria-label={`Add money to ${vault.name}`}
              className="secondary-button"
              type="button"
              onClick={() => openContribution(vault)}
            >
              <Plus aria-hidden="true" /> Add money
            </button>
            <button className="text-button" type="button" onClick={() => openEditor(vault)}>
              <Pencil aria-hidden="true" /> Edit {vault.name}
            </button>
            {!vault.isGeneral && (
              <button
                className="text-button danger-action"
                type="button"
                disabled={pending.has(archiveKey) || successfulActions.has(archiveKey)}
                onClick={() => archiveVault(vault)}
              >
                <Archive aria-hidden="true" />
                {pending.has(archiveKey) ? `Archiving ${vault.name}…` : successfulActions.has(archiveKey) ? `Archived ${vault.name}` : `Archive ${vault.name}`}
              </button>
            )}
          </div>
        )}

        {errors[archiveKey] && <p className="form-error" role="alert">{errors[archiveKey]}</p>}

        {contributingTo === vault.id && !archivedView && (
          <form className="vault-inline-form" aria-label={`Add money to ${vault.name}`} onSubmit={(event) => contribute(event, vault)}>
            <label htmlFor={`vault-contribution-${vault.id}`}>Contribution for {vault.name}</label>
            <input
              id={`vault-contribution-${vault.id}`}
              inputMode="decimal"
              pattern="\d+(?:\.\d{1,2})?"
              required
              value={contributionAmounts[vault.id] ?? ''}
              onChange={(event) => setContributionAmounts((current) => ({ ...current, [vault.id]: event.target.value }))}
            />
            {errors[contributionKey] && <p className="form-error" role="alert">{errors[contributionKey]}</p>}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={pending.has(contributionKey)}>
                {pending.has(contributionKey) ? `Adding to ${vault.name}…` : `Add to ${vault.name}`}
              </button>
              <button className="secondary-button" type="button" onClick={() => setContributingTo(undefined)}>Cancel</button>
            </div>
          </form>
        )}

        {editingId === vault.id && !archivedView && (
          <form className="vault-inline-form" aria-label={`Edit ${vault.name}`} onSubmit={(event) => updateVault(event, vault)}>
            {!vault.isGeneral && (
              <>
                <label htmlFor={`vault-name-${vault.id}`}>Goal name</label>
                <input id={`vault-name-${vault.id}`} required maxLength={80} value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
                <label htmlFor={`vault-emoji-${vault.id}`}>Goal emoji</label>
                <input id={`vault-emoji-${vault.id}`} required maxLength={16} value={editDraft.emoji} onChange={(event) => setEditDraft({ ...editDraft, emoji: event.target.value })} />
              </>
            )}
            <label htmlFor={`vault-target-${vault.id}`}>Target amount for {vault.name}</label>
            <input id={`vault-target-${vault.id}`} inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" required value={editDraft.targetAmount} onChange={(event) => setEditDraft({ ...editDraft, targetAmount: event.target.value })} />
            <label htmlFor={`vault-date-${vault.id}`}>Target date for {vault.name} (optional)</label>
            <input id={`vault-date-${vault.id}`} type="date" value={editDraft.targetDate} onChange={(event) => setEditDraft({ ...editDraft, targetDate: event.target.value })} />
            {errors[updateKey] && <p className="form-error" role="alert">{errors[updateKey]}</p>}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={pending.has(updateKey)}>
                {pending.has(updateKey) ? `Saving ${vault.name}…` : `Save ${vault.name}`}
              </button>
              <button className="secondary-button" type="button" onClick={() => setEditingId(undefined)}>Cancel</button>
            </div>
          </form>
        )}
      </article>
    );
  }

  return (
    <section className="vault-goals insight-panel" aria-labelledby={headingId}>
      <div className="section-heading">
        <div><p className="eyebrow">Savings, with a purpose</p><h2 id={headingId}>Vault goals</h2></div>
        <button className="secondary-button compact-button" type="button" onClick={openCreate}>New Vault</button>
      </div>
      {refreshNotice && <p className="form-warning" role="alert">{refreshNotice}</p>}

      {creating && (
        <form className="vault-create-form" aria-label="Create Vault" onSubmit={createVault}>
          <label htmlFor="new-vault-name">Goal name</label>
          <input id="new-vault-name" required maxLength={80} value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} />
          <label htmlFor="new-vault-emoji">Goal emoji</label>
          <input id="new-vault-emoji" required maxLength={16} value={createDraft.emoji} onChange={(event) => setCreateDraft({ ...createDraft, emoji: event.target.value })} />
          <label htmlFor="new-vault-target">Target amount</label>
          <input id="new-vault-target" inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" required value={createDraft.targetAmount} onChange={(event) => setCreateDraft({ ...createDraft, targetAmount: event.target.value })} />
          <label htmlFor="new-vault-date">Target date</label>
          <input id="new-vault-date" type="date" value={createDraft.targetDate} onChange={(event) => setCreateDraft({ ...createDraft, targetDate: event.target.value })} />
          {errors.create && <p className="form-error" role="alert">{errors.create}</p>}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={pending.has('create')}>
              {pending.has('create') ? 'Creating Vault…' : 'Create Vault'}
            </button>
            <button className="secondary-button" type="button" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="vault-grid">
        {activeVaults.map((vault) => renderVault(vault))}
      </div>
      {activeVaults.length === 0 && <p className="compact-empty">No active Vaults yet. Create a goal to start saving toward it.</p>}

      {archivedVaults.length > 0 && (
        <details className="archived-vaults">
          <summary>Archived Vaults ({archivedVaults.length})</summary>
          <div className="vault-grid">{archivedVaults.map((vault) => renderVault(vault, true))}</div>
        </details>
      )}
    </section>
  );
}
