import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import type {
  AssetRecord,
  AssetType,
  CreateAssetInput,
  CreateLiabilityInput,
  LiabilityRecord,
  LiabilityType,
  UpdateAssetInput,
  UpdateLiabilityInput,
} from '../../shared/contracts';
import { api } from '../api';
import { formatMoney } from '../format';

interface NetWorthEditorProps {
  assets: AssetRecord[];
  liabilities: LiabilityRecord[];
  onRefresh: () => Promise<void>;
  onClose?: () => void;
}

interface AssetDraft {
  name: string;
  type: AssetType;
  currentValue: string;
  note: string;
}

interface LiabilityDraft {
  name: string;
  type: LiabilityType;
  outstandingBalance: string;
  note: string;
}

const emptyAsset: AssetDraft = { name: '', type: 'cash', currentValue: '', note: '' };
const emptyLiability: LiabilityDraft = { name: '', type: 'loan', outstandingBalance: '', note: '' };

const assetTypes: ReadonlyArray<readonly [AssetType, string]> = [
  ['cash', 'Cash'],
  ['bank', 'Bank'],
  ['investment', 'Investment'],
  ['property', 'Property'],
  ['vehicle', 'Vehicle'],
  ['other', 'Other'],
];

const liabilityTypes: ReadonlyArray<readonly [LiabilityType, string]> = [
  ['loan', 'Loan'],
  ['credit-card', 'Credit card'],
  ['mortgage', 'Mortgage'],
  ['other', 'Other'],
];

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function assetPayload(draft: AssetDraft): CreateAssetInput {
  return {
    name: draft.name,
    type: draft.type,
    currentValue: draft.currentValue,
    ...(draft.note ? { note: draft.note } : {}),
  };
}

function liabilityPayload(draft: LiabilityDraft): CreateLiabilityInput {
  return {
    name: draft.name,
    type: draft.type,
    outstandingBalance: draft.outstandingBalance,
    ...(draft.note ? { note: draft.note } : {}),
  };
}

export function NetWorthEditor({ assets, liabilities, onRefresh, onClose }: NetWorthEditorProps) {
  const headingId = useId();
  const mounted = useRef(true);
  const actionLocks = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshNotice, setRefreshNotice] = useState('');
  const [assetItems, setAssetItems] = useState(assets);
  const [liabilityItems, setLiabilityItems] = useState(liabilities);
  const [newAsset, setNewAsset] = useState<AssetDraft>(emptyAsset);
  const [newLiability, setNewLiability] = useState<LiabilityDraft>(emptyLiability);
  const [editingAssetId, setEditingAssetId] = useState<string>();
  const [editingLiabilityId, setEditingLiabilityId] = useState<string>();
  const [assetEdit, setAssetEdit] = useState<AssetDraft>(emptyAsset);
  const [liabilityEdit, setLiabilityEdit] = useState<LiabilityDraft>(emptyLiability);

  useEffect(() => {
    setAssetItems(assets);
  }, [assets]);

  useEffect(() => {
    setLiabilityItems(liabilities);
  }, [liabilities]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  async function refreshAfterMutation(successMessage: string) {
    try {
      await onRefresh();
    } catch {
      if (mounted.current) setRefreshNotice(`${successMessage}; refresh failed. Use Refresh to update this view.`);
    }
  }

  function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('asset:create', async () => {
      const created = await api.createAsset(assetPayload(newAsset));
      if (mounted.current) {
        setAssetItems((current) => [...current, created]);
        setNewAsset(emptyAsset);
      }
      await refreshAfterMutation('Asset saved successfully');
    }, 'Asset could not be added. Try again.');
  }

  function createLiability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('liability:create', async () => {
      const created = await api.createLiability(liabilityPayload(newLiability));
      if (mounted.current) {
        setLiabilityItems((current) => [...current, created]);
        setNewLiability(emptyLiability);
      }
      await refreshAfterMutation('Liability saved successfully');
    }, 'Liability could not be added. Try again.');
  }

  function openAssetEditor(item: AssetRecord) {
    setActionError(`asset:update:${item.id}`, '');
    setAssetEdit({ name: item.name, type: item.type, currentValue: item.currentValue, note: item.note ?? '' });
    setEditingAssetId(item.id);
  }

  function openLiabilityEditor(item: LiabilityRecord) {
    setActionError(`liability:update:${item.id}`, '');
    setLiabilityEdit({
      name: item.name,
      type: item.type,
      outstandingBalance: item.outstandingBalance,
      note: item.note ?? '',
    });
    setEditingLiabilityId(item.id);
  }

  function updateAsset(event: FormEvent<HTMLFormElement>, item: AssetRecord) {
    event.preventDefault();
    const key = `asset:update:${item.id}`;
    const input: UpdateAssetInput = assetPayload(assetEdit);
    void runAction(key, async () => {
      const updated = await api.updateAsset(item.id, input);
      if (mounted.current) {
        setAssetItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
        setEditingAssetId((current) => current === item.id ? undefined : current);
      }
      await refreshAfterMutation(`${item.name} saved successfully`);
    }, `${item.name} could not be updated. Try again.`);
  }

  function updateLiability(event: FormEvent<HTMLFormElement>, item: LiabilityRecord) {
    event.preventDefault();
    const key = `liability:update:${item.id}`;
    const input: UpdateLiabilityInput = liabilityPayload(liabilityEdit);
    void runAction(key, async () => {
      const updated = await api.updateLiability(item.id, input);
      if (mounted.current) {
        setLiabilityItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
        setEditingLiabilityId((current) => current === item.id ? undefined : current);
      }
      await refreshAfterMutation(`${item.name} saved successfully`);
    }, `${item.name} could not be updated. Try again.`);
  }

  function deleteAsset(item: AssetRecord) {
    if (!window.confirm(`Delete asset "${item.name}"? This cannot be undone.`)) return;
    const key = `asset:delete:${item.id}`;
    void runAction(key, async () => {
      await api.deleteAsset(item.id);
      if (mounted.current) setAssetItems((current) => current.filter((candidate) => candidate.id !== item.id));
      await refreshAfterMutation(`${item.name} deleted successfully`);
    }, `${item.name} could not be deleted. Try again.`);
  }

  function deleteLiability(item: LiabilityRecord) {
    if (!window.confirm(`Delete liability "${item.name}"? This cannot be undone.`)) return;
    const key = `liability:delete:${item.id}`;
    void runAction(key, async () => {
      await api.deleteLiability(item.id);
      if (mounted.current) setLiabilityItems((current) => current.filter((candidate) => candidate.id !== item.id));
      await refreshAfterMutation(`${item.name} deleted successfully`);
    }, `${item.name} could not be deleted. Try again.`);
  }

  return (
    <section className="net-worth-editor insight-panel" aria-labelledby={headingId}>
      <div className="section-heading">
        <div><p className="eyebrow">Manual records only</p><h2 id={headingId}>Manage assets and liabilities</h2></div>
        {onClose && <button className="text-button" type="button" onClick={onClose}>Close editor</button>}
      </div>
      <p className="editor-note">Lent and borrowed money stay in their original records and are not editable here.</p>
      {refreshNotice && <p className="form-warning" role="alert">{refreshNotice}</p>}

      <div className="worth-editor-columns">
        <section aria-labelledby={`${headingId}-assets`}>
          <h3 id={`${headingId}-assets`}>Assets</h3>
          <form className="worth-entry-form" aria-label="Add asset" onSubmit={createAsset}>
            <label htmlFor="asset-name">Asset name</label>
            <input id="asset-name" required maxLength={80} value={newAsset.name} onChange={(event) => setNewAsset({ ...newAsset, name: event.target.value })} />
            <label htmlFor="asset-type">Asset type</label>
            <select id="asset-type" value={newAsset.type} onChange={(event) => setNewAsset({ ...newAsset, type: event.target.value as AssetType })}>
              {assetTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label htmlFor="asset-value">Current value</label>
            <input id="asset-value" inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" required value={newAsset.currentValue} onChange={(event) => setNewAsset({ ...newAsset, currentValue: event.target.value })} />
            <label htmlFor="asset-note">Asset note (optional)</label>
            <textarea id="asset-note" maxLength={500} value={newAsset.note} onChange={(event) => setNewAsset({ ...newAsset, note: event.target.value })} />
            {errors['asset:create'] && <p className="form-error" role="alert">{errors['asset:create']}</p>}
            <button className="primary-button" type="submit" disabled={pending.has('asset:create')}>
              {pending.has('asset:create') ? 'Adding asset…' : 'Add asset'}
            </button>
          </form>

          <div className="worth-item-list">
            {assetItems.length === 0 && <p className="compact-empty">No manual assets recorded.</p>}
            {assetItems.map((item) => {
              const updateKey = `asset:update:${item.id}`;
              const deleteKey = `asset:delete:${item.id}`;
              return (
                <article className="worth-item" aria-label={`Asset ${item.name}`} key={item.id}>
                  <div className="worth-item-heading">
                    <div><h4>{item.name}</h4><span>{assetTypes.find(([value]) => value === item.type)?.[1]}</span></div>
                    <strong>{formatMoney(item.currentValue)}</strong>
                  </div>
                  {item.note && <p>{item.note}</p>}
                  <div className="record-actions">
                    <button className="text-button" type="button" onClick={() => openAssetEditor(item)}><Pencil aria-hidden="true" /> Edit asset {item.name}</button>
                    <button className="text-button danger-action" type="button" disabled={pending.has(deleteKey)} onClick={() => deleteAsset(item)}><Trash2 aria-hidden="true" /> {pending.has(deleteKey) ? `Deleting asset ${item.name}…` : `Delete asset ${item.name}`}</button>
                  </div>
                  {errors[deleteKey] && <p className="form-error" role="alert">{errors[deleteKey]}</p>}
                  {editingAssetId === item.id && (
                    <form className="worth-entry-form inline" aria-label={`Edit asset ${item.name}`} onSubmit={(event) => updateAsset(event, item)}>
                      <label htmlFor={`asset-name-${item.id}`}>Asset name for {item.name}</label>
                      <input id={`asset-name-${item.id}`} required maxLength={80} value={assetEdit.name} onChange={(event) => setAssetEdit({ ...assetEdit, name: event.target.value })} />
                      <label htmlFor={`asset-type-${item.id}`}>Asset type for {item.name}</label>
                      <select id={`asset-type-${item.id}`} value={assetEdit.type} onChange={(event) => setAssetEdit({ ...assetEdit, type: event.target.value as AssetType })}>{assetTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                      <label htmlFor={`asset-value-${item.id}`}>Current value for {item.name}</label>
                      <input id={`asset-value-${item.id}`} inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" required value={assetEdit.currentValue} onChange={(event) => setAssetEdit({ ...assetEdit, currentValue: event.target.value })} />
                      <label htmlFor={`asset-note-${item.id}`}>Asset note for {item.name} (optional)</label>
                      <textarea id={`asset-note-${item.id}`} maxLength={500} value={assetEdit.note} onChange={(event) => setAssetEdit({ ...assetEdit, note: event.target.value })} />
                      {errors[updateKey] && <p className="form-error" role="alert">{errors[updateKey]}</p>}
                      <div className="form-actions">
                        <button className="primary-button" type="submit" disabled={pending.has(updateKey)}>{pending.has(updateKey) ? `Saving asset ${item.name}…` : `Save asset ${item.name}`}</button>
                        <button className="secondary-button" type="button" onClick={() => setEditingAssetId(undefined)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby={`${headingId}-liabilities`}>
          <h3 id={`${headingId}-liabilities`}>Liabilities</h3>
          <form className="worth-entry-form" aria-label="Add liability" onSubmit={createLiability}>
            <label htmlFor="liability-name">Liability name</label>
            <input id="liability-name" required maxLength={80} value={newLiability.name} onChange={(event) => setNewLiability({ ...newLiability, name: event.target.value })} />
            <label htmlFor="liability-type">Liability type</label>
            <select id="liability-type" value={newLiability.type} onChange={(event) => setNewLiability({ ...newLiability, type: event.target.value as LiabilityType })}>
              {liabilityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label htmlFor="liability-balance">Outstanding balance</label>
            <input id="liability-balance" inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" required value={newLiability.outstandingBalance} onChange={(event) => setNewLiability({ ...newLiability, outstandingBalance: event.target.value })} />
            <label htmlFor="liability-note">Liability note (optional)</label>
            <textarea id="liability-note" maxLength={500} value={newLiability.note} onChange={(event) => setNewLiability({ ...newLiability, note: event.target.value })} />
            {errors['liability:create'] && <p className="form-error" role="alert">{errors['liability:create']}</p>}
            <button className="primary-button" type="submit" disabled={pending.has('liability:create')}>
              {pending.has('liability:create') ? 'Adding liability…' : 'Add liability'}
            </button>
          </form>

          <div className="worth-item-list">
            {liabilityItems.length === 0 && <p className="compact-empty">No manual liabilities recorded.</p>}
            {liabilityItems.map((item) => {
              const updateKey = `liability:update:${item.id}`;
              const deleteKey = `liability:delete:${item.id}`;
              return (
                <article className="worth-item" aria-label={`Liability ${item.name}`} key={item.id}>
                  <div className="worth-item-heading">
                    <div><h4>{item.name}</h4><span>{liabilityTypes.find(([value]) => value === item.type)?.[1]}</span></div>
                    <strong>{formatMoney(item.outstandingBalance)}</strong>
                  </div>
                  {item.note && <p>{item.note}</p>}
                  <div className="record-actions">
                    <button className="text-button" type="button" onClick={() => openLiabilityEditor(item)}><Pencil aria-hidden="true" /> Edit liability {item.name}</button>
                    <button className="text-button danger-action" type="button" disabled={pending.has(deleteKey)} onClick={() => deleteLiability(item)}><Trash2 aria-hidden="true" /> {pending.has(deleteKey) ? `Deleting liability ${item.name}…` : `Delete liability ${item.name}`}</button>
                  </div>
                  {errors[deleteKey] && <p className="form-error" role="alert">{errors[deleteKey]}</p>}
                  {editingLiabilityId === item.id && (
                    <form className="worth-entry-form inline" aria-label={`Edit liability ${item.name}`} onSubmit={(event) => updateLiability(event, item)}>
                      <label htmlFor={`liability-name-${item.id}`}>Liability name for {item.name}</label>
                      <input id={`liability-name-${item.id}`} required maxLength={80} value={liabilityEdit.name} onChange={(event) => setLiabilityEdit({ ...liabilityEdit, name: event.target.value })} />
                      <label htmlFor={`liability-type-${item.id}`}>Liability type for {item.name}</label>
                      <select id={`liability-type-${item.id}`} value={liabilityEdit.type} onChange={(event) => setLiabilityEdit({ ...liabilityEdit, type: event.target.value as LiabilityType })}>{liabilityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                      <label htmlFor={`liability-balance-${item.id}`}>Outstanding balance for {item.name}</label>
                      <input id={`liability-balance-${item.id}`} inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" required value={liabilityEdit.outstandingBalance} onChange={(event) => setLiabilityEdit({ ...liabilityEdit, outstandingBalance: event.target.value })} />
                      <label htmlFor={`liability-note-${item.id}`}>Liability note for {item.name} (optional)</label>
                      <textarea id={`liability-note-${item.id}`} maxLength={500} value={liabilityEdit.note} onChange={(event) => setLiabilityEdit({ ...liabilityEdit, note: event.target.value })} />
                      {errors[updateKey] && <p className="form-error" role="alert">{errors[updateKey]}</p>}
                      <div className="form-actions">
                        <button className="primary-button" type="submit" disabled={pending.has(updateKey)}>{pending.has(updateKey) ? `Saving liability ${item.name}…` : `Save liability ${item.name}`}</button>
                        <button className="secondary-button" type="button" onClick={() => setEditingLiabilityId(undefined)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
