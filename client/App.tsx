import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { api } from './api';
import { AppShell } from './components/AppShell';
import { AddPage } from './pages/AddPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BudgetCalendarPage } from './pages/BudgetCalendarPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';

type AuthState = 'checking' | 'authenticated' | 'anonymous';

export function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    void api.me()
      .then(({ authenticated }) => setAuthState(authenticated ? 'authenticated' : 'anonymous'))
      .catch(() => setAuthState('anonymous'));
  }, []);

  if (authState === 'checking') {
    return <div className="boot-screen"><span className="boot-mark" />Opening your private ledger…</div>;
  }

  if (authState === 'anonymous') {
    return <LoginPage onAuthenticated={() => setAuthState('authenticated')} />;
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      setAuthState('anonymous');
    }
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell onLogout={logout} />}>
          <Route index element={<DashboardPage />} />
          <Route path="add" element={<AddPage />} />
          <Route path="budget-calendar" element={<BudgetCalendarPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
