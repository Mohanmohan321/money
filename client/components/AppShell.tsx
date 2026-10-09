import { BarChart3, CalendarDays, History, LayoutDashboard, LogOut, Plus, WalletCards } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/add', label: 'Add', icon: Plus },
  { to: '/budget-calendar', label: 'Budget Calendar', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History },
  { to: '/analytics', label: 'Analysis', icon: BarChart3 },
];

interface AppShellProps {
  onLogout(): Promise<void>;
}

export function AppShell({ onLogout }: AppShellProps) {
  return (
    <div className="app-frame">
      <aside className="side-rail">
        <div className="wordmark"><WalletCards aria-hidden="true" /><span>Ledgerly</span></div>
        <nav aria-label="Primary navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="logout-button" type="button" aria-label="Log out from Ledgerly" onClick={() => void onLogout()}>
          <LogOut aria-hidden="true" /><span>Log out</span>
        </button>
      </aside>

      <div className="mobile-topbar">
        <div className="wordmark"><WalletCards aria-hidden="true" /><span>Ledgerly</span></div>
        <button className="icon-button" type="button" aria-label="Log out" onClick={() => void onLogout()}>
          <LogOut aria-hidden="true" />
        </button>
      </div>

      <main className="app-content"><Outlet /></main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
