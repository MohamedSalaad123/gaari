/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { SidebarLayout } from './components/SidebarLayout';
import { LanguageProvider, useLanguage } from './i18n';
import { apiFetch, clearAuthToken, setUnauthorizedListener } from './lib/api';
import { AuthPage } from './pages/AuthPage';
import { DailyWorkPage } from './pages/DailyWorkPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { RentalPaymentsPage } from './pages/RentalPaymentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { VehiclesPage } from './pages/VehiclesPage';
import type { AuthStatus, AuthUser, NavSection } from './types';

function AppShell() {
  const { t } = useLanguage();
  const [authLoading, setAuthLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [dbConnected, setDbConnected] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  const checkAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await apiFetch<AuthStatus>('/api/auth/status');
      setNeedsSetup(status.needsSetup);
      setDbConfigured(status.dbConfigured ?? true);
      setDbConnected(status.dbConnected ?? true);
      setDbError(status.dbError ?? null);
      if (status.authenticated && status.user) {
        setUser(status.user);
      } else {
        clearAuthToken();
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedListener(() => {
      setUser(null);
      setActiveSection('dashboard');
    });
    return () => setUnauthorizedListener(null);
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleSetupCompleted = () => {
    setNeedsSetup(false);
    setUser(null);
  };

  const handleAuthenticated = (authedUser: AuthUser) => {
    setNeedsSetup(false);
    setUser(authedUser);
    setActiveSection('dashboard');
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session regardless
    }
    clearAuthToken();
    setUser(null);
    setActiveSection('dashboard');
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B162C] px-4">
        <div className="text-sm font-medium text-slate-300">{t('loadingApp')}</div>
      </div>
    );
  }

  if (!dbConnected || needsSetup || !user) {
    return (
      <AuthPage
        needsSetup={needsSetup}
        dbConfigured={dbConfigured}
        dbConnected={dbConnected}
        dbError={dbError}
        onRetryConnection={() => void checkAuth()}
        onSetupCompleted={handleSetupCompleted}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <SidebarLayout
      activeSection={activeSection}
      onNavigate={setActiveSection}
      onLogout={() => void handleLogout()}
      user={user}
      headerAction={
        activeSection !== 'daily-work' ? (
          <button
            type="button"
            onClick={() => setActiveSection('daily-work')}
            className="min-h-[38px] rounded-lg bg-[#1D4E89] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#163D6B] whitespace-nowrap shrink-0"
          >
            {t('recordDailyWorkCta')}
          </button>
        ) : null
      }
    >
      {activeSection === 'dashboard' && <DashboardPage onNavigate={setActiveSection} />}
      {activeSection === 'vehicles' && <VehiclesPage />}
      {activeSection === 'daily-work' && <DailyWorkPage />}
      {activeSection === 'expenses' && <ExpensesPage />}
      {activeSection === 'rental-payments' && <RentalPaymentsPage />}
      {activeSection === 'reports' && <ReportsPage />}
      {activeSection === 'settings' && <SettingsPage />}
    </SidebarLayout>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}
