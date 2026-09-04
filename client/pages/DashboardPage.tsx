import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';

import type {
  AssetRecord,
  DashboardData,
  LiabilityRecord,
  MonthlyAnalysisData,
  NetWorthSummary,
  SubscriptionCandidateList,
  UpsertBudgetInput,
  Vault,
} from '../../shared/contracts';
import { api } from '../api';
import { BudgetOverview } from '../components/BudgetOverview';
import { MovementChart } from '../components/MovementChart';
import { NetWorthCard } from '../components/NetWorthCard';
import { NetWorthEditor } from '../components/NetWorthEditor';
import { RecentActivity } from '../components/RecentActivity';
import { SnapReceipt } from '../components/SnapReceipt';
import { SubscriptionDetector } from '../components/SubscriptionDetector';
import { VaultGoals } from '../components/VaultGoals';

function localCurrentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('The current month could not be determined');
  return `${year}-${month}`;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [monthly, setMonthly] = useState<MonthlyAnalysisData>();
  const [netWorth, setNetWorth] = useState<NetWorthSummary>();
  const [vaults, setVaults] = useState<Vault[]>();
  const [assets, setAssets] = useState<AssetRecord[]>();
  const [liabilities, setLiabilities] = useState<LiabilityRecord[]>();
  const [subscriptions, setSubscriptions] = useState<SubscriptionCandidateList>();
  const [subscriptionError, setSubscriptionError] = useState('');
  const [worthEditorOpen, setWorthEditorOpen] = useState(false);
  const [worthEditorLoading, setWorthEditorLoading] = useState(false);
  const [worthEditorError, setWorthEditorError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasPartialFailure, setHasPartialFailure] = useState(false);
  const [month] = useState(localCurrentMonth);
  const mounted = useRef(false);
  const groupedRequestGeneration = useRef(0);
  const dashboardRequestGeneration = useRef(0);
  const monthlyRequestGeneration = useRef(0);
  const netWorthRequestGeneration = useRef(0);
  const vaultRequestGeneration = useRef(0);
  const worthRecordsRequestGeneration = useRef(0);
  const subscriptionRequestGeneration = useRef(0);
  const monthlyQuery = new URLSearchParams({ month }).toString();

  const loadMonthlyAnalysis = useCallback(async () => {
    const generation = ++monthlyRequestGeneration.current;
    const refreshed = await api.monthlyAnalysis(monthlyQuery);
    if (mounted.current && generation === monthlyRequestGeneration.current) setMonthly(refreshed);
  }, [monthlyQuery]);

  const loadDailyDashboard = useCallback(async () => {
    const generation = ++dashboardRequestGeneration.current;
    const refreshed = await api.dashboard();
    if (mounted.current && generation === dashboardRequestGeneration.current) setData(refreshed);
  }, []);

  const loadNetWorth = useCallback(async () => {
    const generation = ++netWorthRequestGeneration.current;
    const refreshed = await api.netWorth();
    if (mounted.current && generation === netWorthRequestGeneration.current) setNetWorth(refreshed);
  }, []);

  const loadVaults = useCallback(async () => {
    const generation = ++vaultRequestGeneration.current;
    const refreshed = await api.vaults();
    if (mounted.current && generation === vaultRequestGeneration.current) setVaults(refreshed.items);
  }, []);

  const loadSubscriptions = useCallback(async () => {
    const generation = ++subscriptionRequestGeneration.current;
    setSubscriptionError('');
    try {
      const refreshed = await api.subscriptions();
      if (mounted.current && generation === subscriptionRequestGeneration.current) setSubscriptions(refreshed);
    } catch (caught) {
      if (mounted.current && generation === subscriptionRequestGeneration.current) {
        setSubscriptionError('Subscriptions could not be loaded. Try refreshing this section.');
      }
      throw caught;
    }
  }, []);

  const refreshAfterContribution = useCallback(async () => {
    const results = await Promise.allSettled([loadVaults(), loadMonthlyAnalysis()]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }, [loadMonthlyAnalysis, loadVaults]);

  const loadDashboard = useCallback(async () => {
    const groupedGeneration = ++groupedRequestGeneration.current;
    const dashboardGeneration = ++dashboardRequestGeneration.current;
    const monthlyGeneration = ++monthlyRequestGeneration.current;
    const netWorthGeneration = ++netWorthRequestGeneration.current;
    const vaultGeneration = ++vaultRequestGeneration.current;
    const subscriptionGeneration = ++subscriptionRequestGeneration.current;
    setLoading(true);
    const results = await Promise.allSettled([
      api.dashboard(),
      api.monthlyAnalysis(monthlyQuery),
      api.netWorth(),
      api.vaults(),
      api.subscriptions(),
    ] as const);

    if (!mounted.current || groupedGeneration !== groupedRequestGeneration.current) return;
    const monthlyResultIsCurrent = monthlyGeneration === monthlyRequestGeneration.current;
    const netWorthResultIsCurrent = netWorthGeneration === netWorthRequestGeneration.current;
    const vaultResultIsCurrent = vaultGeneration === vaultRequestGeneration.current;
    const subscriptionResultIsCurrent = subscriptionGeneration === subscriptionRequestGeneration.current;
    const dashboardResultIsCurrent = dashboardGeneration === dashboardRequestGeneration.current;
    if (results[0].status === 'fulfilled' && dashboardResultIsCurrent) setData(results[0].value);
    if (results[1].status === 'fulfilled' && monthlyResultIsCurrent) {
      setMonthly(results[1].value);
    }
    if (results[2].status === 'fulfilled' && netWorthResultIsCurrent) setNetWorth(results[2].value);
    if (results[3].status === 'fulfilled' && vaultResultIsCurrent) setVaults(results[3].value.items);
    if (results[4].status === 'fulfilled' && subscriptionResultIsCurrent) {
      setSubscriptions(results[4].value);
      setSubscriptionError('');
    }
    if (results[4].status === 'rejected' && subscriptionResultIsCurrent) {
      setSubscriptionError('Subscriptions could not be loaded. Try refreshing this section.');
    }
    const resultIsCurrent = [dashboardResultIsCurrent, monthlyResultIsCurrent, netWorthResultIsCurrent, vaultResultIsCurrent, subscriptionResultIsCurrent];
    setHasPartialFailure(results.some((result, index) => result.status === 'rejected' && resultIsCurrent[index]));
    setLoading(false);
  }, [monthlyQuery]);

  useEffect(() => {
    mounted.current = true;
    void loadDashboard();
    return () => {
      mounted.current = false;
      groupedRequestGeneration.current += 1;
      dashboardRequestGeneration.current += 1;
      monthlyRequestGeneration.current += 1;
      netWorthRequestGeneration.current += 1;
      vaultRequestGeneration.current += 1;
      worthRecordsRequestGeneration.current += 1;
      subscriptionRequestGeneration.current += 1;
    };
  }, [loadDashboard]);

  async function saveBudget(input: UpsertBudgetInput) {
    await api.saveBudget(month, input);
    await loadMonthlyAnalysis();
  }

  async function openWorthEditor() {
    setWorthEditorOpen(true);
    setWorthEditorLoading(true);
    setWorthEditorError('');
    setAssets(undefined);
    setLiabilities(undefined);
    const generation = ++worthRecordsRequestGeneration.current;
    const results = await Promise.allSettled([api.assets(), api.liabilities()] as const);
    if (!mounted.current || generation !== worthRecordsRequestGeneration.current) return;
    if (results[0].status === 'fulfilled') setAssets(results[0].value.items);
    if (results[1].status === 'fulfilled') setLiabilities(results[1].value.items);
    if (results.some((result) => result.status === 'rejected')) {
      setWorthEditorError('Manual assets and liabilities could not be loaded. Close the editor and try again.');
    }
    setWorthEditorLoading(false);
  }

  function closeWorthEditor() {
    worthRecordsRequestGeneration.current += 1;
    setWorthEditorOpen(false);
    setWorthEditorLoading(false);
    setWorthEditorError('');
  }

  if (loading && !data && !monthly && !netWorth) {
    return <div className="page-state">Reading your ledger…</div>;
  }

  return (
    <div className="page dashboard-page">
      {hasPartialFailure && (
        <div className="partial-failure" role="alert">
          <span>Some dashboard details could not be loaded.</span>
          <button className="text-button" type="button" onClick={() => void loadDashboard()}>
            Refresh and try again
          </button>
        </div>
      )}

      {monthly && <BudgetOverview data={monthly} onSave={saveBudget} />}
      {netWorth && <NetWorthCard data={netWorth} onManage={() => void openWorthEditor()} />}
      {worthEditorOpen && worthEditorLoading && <div className="page-state compact-state">Loading manual net worth records…</div>}
      {worthEditorOpen && worthEditorError && <p className="partial-failure" role="alert">{worthEditorError}</p>}
      {worthEditorOpen && !worthEditorLoading && assets && liabilities && (
        <NetWorthEditor assets={assets} liabilities={liabilities} onRefresh={loadNetWorth} onClose={closeWorthEditor} />
      )}
      {monthly && <RecentActivity items={monthly.recentActivity} />}
      <SnapReceipt compact onSaved={async () => {
        const results = await Promise.allSettled([loadMonthlyAnalysis(), loadDailyDashboard()]);
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }} />
      {vaults && (
        <VaultGoals
          vaults={vaults}
          onRefresh={loadVaults}
          onContributionRefresh={refreshAfterContribution}
        />
      )}
      <SubscriptionDetector
        data={subscriptions}
        error={subscriptionError}
        actualSpending={monthly?.summary.spending ?? '0.00'}
        onRefresh={loadSubscriptions}
      />

      {data && (
        <>
          <header className="page-header dashboard-header">
            <div>
              <p className="eyebrow">Private ledger</p>
              <h1>Today's snapshot</h1>
            </div>
            <p className="date-stamp">{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}</p>
          </header>

          <section className="daily-ledger" aria-label="Today's highlights">
            <article className="ledger-row transaction">
              <span className="ledger-icon"><ReceiptText aria-hidden="true" /></span>
              <div><p>Transactions</p><small>{data.today.transactionCount} records</small></div>
              <strong>{data.today.totalTransactions}</strong>
            </article>
            <article className="ledger-row lent">
              <span className="ledger-icon"><ArrowUpRight aria-hidden="true" /></span>
              <div><p>Money lent</p><small>{data.today.lendingCount} records</small></div>
              <strong>{data.today.totalLent}</strong>
            </article>
            <article className="ledger-row borrowed">
              <span className="ledger-icon"><ArrowDownLeft aria-hidden="true" /></span>
              <div><p>Money borrowed</p><small>{data.today.borrowingCount} records</small></div>
              <strong>{data.today.totalBorrowed}</strong>
            </article>
          </section>

          <section className="insight-panel">
            <div className="section-heading">
              <div><p className="eyebrow">Seven-day view</p><h2>This week in motion</h2></div>
              <span>{data.week.recordCount} records</span>
            </div>
            <MovementChart points={data.week.daily} compact />
          </section>

          <section className="month-line" aria-label="This month summary">
            <div><span>This month</span><strong>{data.month.recordCount}</strong><small>records logged</small></div>
            <div className="mini-rails" aria-hidden="true"><span /><span /><span /></div>
          </section>
        </>
      )}
    </div>
  );
}
