import {
  BarChart3,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Truck,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLanguage } from '../i18n';
import type { AuthUser, NavSection } from '../types';
import { BrandLogo } from './BrandLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationCenter } from './NotificationCenter';

interface SidebarLayoutProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onLogout: () => void;
  user: AuthUser;
  headerAction?: ReactNode;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ id: NavSection; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'vehicles', icon: Truck },
  { id: 'daily-work', icon: ClipboardList },
  { id: 'expenses', icon: Receipt },
  { id: 'rental-payments', icon: CreditCard },
  { id: 'reports', icon: BarChart3 },
  { id: 'settings', icon: Settings },
];

const MOBILE_PRIMARY_TABS: Array<{ id: NavSection; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'vehicles', icon: Truck },
  { id: 'daily-work', icon: ClipboardList },
  { id: 'expenses', icon: Receipt },
];

export function SidebarLayout({
  activeSection,
  onNavigate,
  onLogout,
  user,
  headerAction,
  children,
}: SidebarLayoutProps) {
  const { t, navLabel, sectionTitle } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (section: NavSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0B162C] text-slate-200">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <BrandLogo size={34} variant="light" />
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            {t('brandName')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#1D4E89] text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{navLabel(item.id)}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 px-3 py-2">
          <div className="text-xs text-slate-400">{t('signedInAs')}</div>
          <div className="truncate text-sm font-medium text-white">{user.fullName}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-red-500/15 hover:text-red-200 whitespace-nowrap"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F4F6F9] text-slate-900">
      {/* Desktop Fixed Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[82vw]">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:h-16 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
              <span className="hidden font-medium text-slate-500 sm:inline">{t('brandName')}</span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-lg">
                {sectionTitle(activeSection)}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationCenter onNavigate={onNavigate} />
            <LanguageSwitcher variant="light" />
            {headerAction && <div className="hidden sm:block">{headerAction}</div>}
          </div>
        </header>

        <main className="print-container mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (one-handed thumb access, <= 56px height) */}
      <nav
        className="no-print fixed bottom-0 left-0 right-0 z-30 grid h-14 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden"
        aria-label="Mobile quick navigation"
      >
        {MOBILE_PRIMARY_TABS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors ${
                active ? 'text-[#1D4E89]' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate px-0.5">{navLabel(item.id)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors ${
            activeSection === 'rental-payments' ||
            activeSection === 'reports' ||
            activeSection === 'settings'
              ? 'text-[#1D4E89]'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span className="max-w-full truncate px-0.5">{t('nav_more')}</span>
        </button>
      </nav>
    </div>
  );
}
