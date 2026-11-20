import {
  Activity,
  ArrowUpRight,
  Calendar,
  ClipboardList,
  Printer,
  Receipt,
  Truck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../i18n';
import { apiFetch, formatUSD, getTodayDate } from '../lib/api';
import type { DashboardData, NavSection } from '../types';

interface DashboardPageProps {
  onNavigate: (section: NavSection) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { t, lang, ownershipLabel, categoryLabel } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (date: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<DashboardData>(
          `/api/dashboard?date=${encodeURIComponent(date)}`
        );
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('loading'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadDashboard(selectedDate);
  }, [selectedDate, loadDashboard]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <p className="font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => void loadDashboard(selectedDate)}
          className="mt-3 min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const {
    financials,
    fleet,
    todayWorkRecords,
    recentExpenses,
    recentActivities,
    summaries,
    monthlyOverview,
    dailyTrend,
  } = data;

  const maxTrendValue = Math.max(
    100,
    ...dailyTrend.map((d) => Math.max(d.income, d.expenses + d.rental))
  );

  const summaryRows = [
    { label: t('periodToday'), period: summaries.daily },
    { label: t('periodWeekly'), period: summaries.weekly },
    { label: t('periodMonthly'), period: summaries.monthly },
  ];

  const handlePrintMonthlySummary = () => {
    window.print();
  };

  const monthHeadingFormatted = (() => {
    const [year, month] = monthlyOverview.monthKey.split('-').map(Number);
    if (!year || !month) return monthlyOverview.monthKey;
    const d = new Date(Date.UTC(year, month - 1, 1));
    return new Intl.DateTimeFormat(lang === 'so' ? 'so-SO' : 'en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  })();

  const printedTimestamp = new Intl.DateTimeFormat(lang === 'so' ? 'so-SO' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <>
      <div className="no-print space-y-6">
        {/* Date Selector & Quick Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('dashOverviewTitle')}</h2>
            <p className="text-sm text-slate-500">{t('dashOverviewSub')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="dashboard-date"
              className="flex min-h-[44px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 sm:flex-none"
            >
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">{t('referenceDate')}</span>
              <input
                id="dashboard-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || getTodayDate())}
                className="w-full bg-transparent font-mono text-sm font-medium text-slate-900 focus:outline-none sm:w-auto"
              />
            </label>

            <button
              type="button"
              onClick={handlePrintMonthlySummary}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Printer className="h-4 w-4 text-[#1D4E89]" />
              <span>{t('printSummaryBtn')}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('daily-work')}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#163D6B] whitespace-nowrap shrink-0"
            >
              <span>{t('logDailyWork')}</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 4 Main Financial Cards */}
        <section
          aria-label="Financial Summary"
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
        >
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">{t('totalIncome')}</div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#16A34A] tabular-nums">
              {formatUSD(financials.totalIncome)}
            </div>
            <div className="mt-2 text-xs text-slate-500">{t('totalIncomeSub')}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">{t('totalExpenses')}</div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#DC2626] tabular-nums">
              {formatUSD(financials.totalExpenses)}
            </div>
            <div className="mt-2 text-xs text-slate-500">{t('totalExpensesSub')}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">{t('totalVehicleRental')}</div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#1D4E89] tabular-nums">
              {formatUSD(financials.totalVehicleRental)}
            </div>
            <div className="mt-2 text-xs text-slate-500 tabular-nums">
              {t('rentalPaidShort')}: {formatUSD(financials.totalRentalPaid)} ·{' '}
              {t('rentalUnpaidShort')}:{' '}
              <span className="font-medium text-slate-700">
                {formatUSD(financials.outstandingRentalBalance)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">{t('netBalance')}</div>
            <div
              className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums ${
                financials.netBalance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {formatUSD(financials.netBalance)}
            </div>
            <div className="mt-2 text-xs text-slate-500">{t('netBalanceSub')}</div>
          </div>
        </section>

        {/* Fleet Operational Strip */}
        <section
          aria-label="Fleet Status Today"
          className="grid grid-cols-2 gap-3.5 lg:grid-cols-4"
        >
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-slate-500">{t('totalVehicles')}</div>
            <div className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {fleet.totalVehicles}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-slate-500">{t('workingVehicles')}</div>
            <div className="mt-1.5 font-mono text-xl font-semibold text-[#16A34A] tabular-nums">
              {fleet.vehiclesWorkingToday}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-slate-500">{t('vehiclesNotWorking')}</div>
            <div className="mt-1.5 font-mono text-xl font-semibold text-slate-700 tabular-nums">
              {fleet.vehiclesNotWorking}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-slate-500">{t('todayWorkEntries')}</div>
            <div className="mt-1.5 font-mono text-xl font-semibold text-[#1D4E89] tabular-nums">
              {todayWorkRecords.length}
            </div>
          </div>
        </section>

        {/* Period Summaries & 7-Day Activity */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="rounded-xl border border-slate-200 bg-white xl:col-span-7">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
              <h3 className="text-base font-semibold text-slate-900">{t('summaryTableTitle')}</h3>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="min-h-[36px] text-xs font-medium text-[#1D4E89] hover:underline whitespace-nowrap"
              >
                {t('openFullReports')}
              </button>
            </div>

            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {summaryRows.map(({ label, period }) => (
                <div key={label} className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-slate-900">{label}</div>
                    <div className="font-mono text-xs text-slate-400">
                      {period.startDate === period.endDate
                        ? period.startDate
                        : `${period.startDate} – ${period.endDate}`}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('incomeCol')}</span>
                      <span className="font-mono font-medium text-[#16A34A] tabular-nums">
                        {formatUSD(period.income)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('expensesCol')}</span>
                      <span className="font-mono font-medium text-[#DC2626] tabular-nums">
                        {formatUSD(period.expenses)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('rentalCol')}</span>
                      <span className="font-mono text-[#1D4E89] tabular-nums">
                        {formatUSD(period.rental)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('netCol')}</span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          period.netBalance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatUSD(period.netBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">{t('periodCol')}</th>
                    <th className="px-4 py-3 text-right">{t('tripsCol')}</th>
                    <th className="px-4 py-3 text-right">{t('incomeCol')}</th>
                    <th className="px-4 py-3 text-right">{t('expensesCol')}</th>
                    <th className="px-4 py-3 text-right">{t('rentalCol')}</th>
                    <th className="px-5 py-3 text-right">{t('netCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summaryRows.map(({ label, period }) => (
                    <tr key={label} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">{label}</div>
                        <div className="font-mono text-xs text-slate-400">
                          {period.startDate === period.endDate
                            ? period.startDate
                            : `${period.startDate} – ${period.endDate}`}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                        {period.trips}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-[#16A34A] tabular-nums">
                        {formatUSD(period.income)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-[#DC2626] tabular-nums">
                        {formatUSD(period.expenses)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-[#1D4E89] tabular-nums">
                        {formatUSD(period.rental)}
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-mono font-semibold tabular-nums ${
                          period.netBalance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatUSD(period.netBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 7-Day Cashflow Comparison */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{t('chartTitle')}</h3>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#16A34A]" />
                  {t('chartIncome')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#DC2626]" />
                  {t('chartCosts')}
                </span>
              </div>
            </div>

            <div className="mt-6 flex h-44 items-end justify-between gap-2 border-b border-slate-200 pb-2">
              {dailyTrend.map((day) => {
                const incomePct = Math.round((day.income / maxTrendValue) * 100);
                const costTotal = day.expenses + day.rental;
                const costPct = Math.round((costTotal / maxTrendValue) * 100);
                const shortDate = day.date.slice(5);

                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div
                        className="w-3 rounded-t bg-[#16A34A] transition-all"
                        style={{ height: `${Math.max(incomePct, day.income > 0 ? 4 : 0)}%` }}
                        title={`${day.date} ${t('chartIncome')}: ${formatUSD(day.income)}`}
                      />
                      <div
                        className="w-3 rounded-t bg-[#DC2626] transition-all"
                        style={{ height: `${Math.max(costPct, costTotal > 0 ? 4 : 0)}%` }}
                        title={`${day.date} ${t('chartCosts')}: ${formatUSD(costTotal)}`}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {shortDate}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">{t('chartHint')}</p>
          </section>
        </div>

        {/* Today's Operations */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#1D4E89]" />
              <h3 className="text-base font-semibold text-slate-900">
                {t('todayOpsTitle')} · <span className="font-mono text-sm">{data.today}</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('daily-work')}
              className="text-xs font-medium text-[#1D4E89] hover:underline whitespace-nowrap"
            >
              {t('manageAllDailyWork')}
            </button>
          </div>

          {todayWorkRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <Truck className="h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">{t('noWorkToday')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('noWorkTodaySub')}</p>
              <button
                type="button"
                onClick={() => onNavigate('daily-work')}
                className="mt-4 min-h-[44px] rounded-lg bg-[#1D4E89] px-4 py-2 text-xs font-medium text-white hover:bg-[#163D6B]"
              >
                {t('recordFirstTripToday')}
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="divide-y divide-slate-100 md:hidden">
                {todayWorkRecords.map((rec) => (
                  <div key={rec.id} className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{rec.vehicle_name}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {rec.plate_number} · {ownershipLabel(rec.ownership)}
                        </div>
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                        {formatUSD(rec.income_received)}
                      </div>
                    </div>
                    <div className="text-sm text-slate-700">
                      {rec.cargo_description} → {rec.destination}
                    </div>
                    <div className="text-xs text-slate-500">
                      {rec.driver_name} · {rec.trips_count} {t('tripsCol')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="px-5 py-3">{t('vehicleCol')}</th>
                      <th className="px-4 py-3">{t('driverCol')}</th>
                      <th className="px-4 py-3">{t('cargoAndNotesCol')}</th>
                      <th className="px-4 py-3">{t('destinationCol')}</th>
                      <th className="px-4 py-3 text-right">{t('tripsCol')}</th>
                      <th className="px-5 py-3 text-right">{t('incomeCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todayWorkRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900">{rec.vehicle_name}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {rec.plate_number} · {ownershipLabel(rec.ownership)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{rec.driver_name}</td>
                        <td className="px-4 py-3 text-slate-700">{rec.cargo_description}</td>
                        <td className="px-4 py-3 text-slate-700">{rec.destination}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                          {rec.trips_count}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-[#16A34A] tabular-nums">
                          {formatUSD(rec.income_received)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Recent Expenses & Recent Vehicle Activities */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Expenses */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#DC2626]" />
                <h3 className="text-base font-semibold text-slate-900">
                  {t('recentExpensesTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('expenses')}
                className="text-xs font-medium text-[#1D4E89] hover:underline whitespace-nowrap"
              >
                {t('viewAllExpenses')}
              </button>
            </div>
            {recentExpenses.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                {t('noRecentExpenses')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{exp.description}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className="font-mono">{exp.expense_date}</span> · {exp.vehicle_name}{' '}
                        (<span className="font-mono">{exp.plate_number}</span>) ·{' '}
                        {categoryLabel(exp.category)}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-sm font-semibold text-[#DC2626] tabular-nums">
                      -{formatUSD(exp.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Vehicle Activities */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#1D4E89]" />
                <h3 className="text-base font-semibold text-slate-900">
                  {t('recentActivityTitle')}
                </h3>
              </div>
            </div>
            {recentActivities.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                {t('noRecentActivity')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentActivities.map((act) => {
                  const typeLabel =
                    act.type === 'work'
                      ? t('activityWork')
                      : act.type === 'expense'
                      ? t('activityExpense')
                      : t('activityRentalPay');

                  const amountClass =
                    act.type === 'work'
                      ? 'text-[#16A34A]'
                      : act.type === 'expense'
                      ? 'text-[#DC2626]'
                      : 'text-[#1D4E89]';

                  return (
                    <div
                      key={act.id}
                      className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{act.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          <span className="font-mono">{act.date}</span> · {typeLabel} ·{' '}
                          {act.vehicle_name}
                          {act.category ? ` · ${categoryLabel(act.category)}` : ''}
                        </div>
                      </div>
                      <div
                        className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${amountClass}`}
                      >
                        {act.type === 'work' ? '+' : '-'}
                        {formatUSD(act.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Printer-Friendly Current Month Financial Overview (Physical Filing Layout) */}
      <section
        aria-label={t('printFilingTitle')}
        className="hidden print-only print-filing-sheet space-y-5 text-slate-900"
      >
        {/* Document Header */}
        <header className="flex items-start justify-between border-b-2 border-[#0B162C] pb-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#1D4E89]">
              {t('brandName')} · {t('brandTagline')}
            </div>
            <h1 className="mt-1 text-xl font-bold text-[#0B162C]">{t('printFilingTitle')}</h1>
            <div className="mt-1 text-xs text-slate-600">
              {t('printFilingMonth')}: <strong className="text-slate-900">{monthHeadingFormatted}</strong>{' '}
              (<span className="font-mono">{monthlyOverview.startDate}</span> {t('dateTo')}{' '}
              <span className="font-mono">{monthlyOverview.endDate}</span>)
            </div>
          </div>
          <div className="border border-slate-300 bg-slate-50 px-3 py-2 text-right text-[11px]">
            <div>
              {t('printFilingRef')}:{' '}
              <strong className="font-mono text-slate-900">
                HL-{monthlyOverview.monthKey.replace('-', '')}
              </strong>
            </div>
            <div className="mt-0.5 text-slate-600">
              {t('printFilingPrintedOn')}: <span className="font-mono">{printedTimestamp}</span>
            </div>
            <div className="mt-0.5 text-slate-500">{t('printFilingCurrencyNote')}</div>
          </div>
        </header>

        {/* Section 1: Current Month Financial Summary */}
        <div className="print-avoid-break">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0B162C]">
            {t('printFilingSummaryHeading')}
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="w-1/3 border-r border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                  {t('totalIncome')}
                </td>
                <td className="w-1/6 border-r border-slate-300 px-3 py-2 text-right font-mono font-bold text-[#16A34A] tabular-nums">
                  {formatUSD(monthlyOverview.income)}
                </td>
                <td className="w-1/3 border-r border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                  {t('totalExpenses')}
                </td>
                <td className="w-1/6 px-3 py-2 text-right font-mono font-bold text-[#DC2626] tabular-nums">
                  {formatUSD(monthlyOverview.expenses)}
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="border-r border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                  {t('totalVehicleRental')}
                </td>
                <td className="border-r border-slate-300 px-3 py-2 text-right font-mono font-bold text-[#1D4E89] tabular-nums">
                  {formatUSD(monthlyOverview.rental)}
                </td>
                <td className="border-r border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                  {t('printFilingRentalPaid')}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                  {formatUSD(monthlyOverview.rentalPaid)}
                </td>
              </tr>
              <tr className="bg-slate-100">
                <td className="border-r border-slate-200 px-3 py-2 font-bold text-slate-900">
                  {t('netBalance')}
                </td>
                <td
                  className={`border-r border-slate-300 px-3 py-2 text-right font-mono text-sm font-bold tabular-nums ${
                    monthlyOverview.netBalance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}
                >
                  {formatUSD(monthlyOverview.netBalance)}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 font-medium text-slate-700">
                  {t('tripsCol')} / {t('entriesCount')}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                  {monthlyOverview.trips} / {monthlyOverview.entries}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 2: Monthly Expenses by Category */}
        <div className="print-avoid-break">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0B162C]">
            {t('printFilingExpensesHeading')}
          </h2>
          {monthlyOverview.expensesByCategory.length === 0 ? (
            <div className="border border-slate-300 px-3 py-3 text-xs text-slate-600">
              {t('printFilingNoExpenses')}
            </div>
          ) : (
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-left font-semibold text-slate-700">
                  <th className="border-r border-slate-200 px-3 py-2">{t('categoryLabel').replace(' *', '')}</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-right">{t('recordsLabel')}</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-right">{t('printFilingShare')}</th>
                  <th className="px-3 py-2 text-right">{t('expensesCol')} (USD)</th>
                </tr>
              </thead>
              <tbody>
                {monthlyOverview.expensesByCategory.map((cat) => {
                  const share =
                    monthlyOverview.expenses > 0
                      ? ((cat.total / monthlyOverview.expenses) * 100).toFixed(1)
                      : '0.0';
                  return (
                    <tr key={cat.category} className="border-b border-slate-200">
                      <td className="border-r border-slate-200 px-3 py-1.5 font-medium text-slate-900">
                        {categoryLabel(cat.category)}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-right font-mono tabular-nums">
                        {cat.count}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-right font-mono tabular-nums">
                        {share}%
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-[#DC2626] tabular-nums">
                        {formatUSD(cat.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td className="border-r border-slate-200 px-3 py-2">{t('printFilingTotalRow')}</td>
                  <td className="border-r border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                    {monthlyOverview.expensesByCategory.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-2 text-right font-mono tabular-nums">
                    100.0%
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#DC2626] tabular-nums">
                    {formatUSD(monthlyOverview.expenses)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Section 3: Monthly Vehicle Financial Breakdown */}
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0B162C]">
            {t('printFilingVehiclesHeading')}
          </h2>
          {monthlyOverview.vehicleBreakdown.length === 0 ? (
            <div className="border border-slate-300 px-3 py-3 text-xs text-slate-600">
              {t('printFilingNoVehicles')}
            </div>
          ) : (
            <table className="w-full border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-left font-semibold text-slate-700">
                  <th className="border-r border-slate-200 px-2.5 py-2">{t('vehicleCol')}</th>
                  <th className="border-r border-slate-200 px-2.5 py-2">{t('plateCol')}</th>
                  <th className="border-r border-slate-200 px-2.5 py-2">{t('ownershipCol')}</th>
                  <th className="border-r border-slate-200 px-2.5 py-2 text-right">{t('tripsCol')}</th>
                  <th className="border-r border-slate-200 px-2.5 py-2 text-right">{t('incomeCol')}</th>
                  <th className="border-r border-slate-200 px-2.5 py-2 text-right">{t('expensesCol')}</th>
                  <th className="border-r border-slate-200 px-2.5 py-2 text-right">{t('rentalCol')}</th>
                  <th className="px-2.5 py-2 text-right">{t('netCol')}</th>
                </tr>
              </thead>
              <tbody>
                {monthlyOverview.vehicleBreakdown.map((v) => (
                  <tr key={v.vehicle_id} className="border-b border-slate-200">
                    <td className="border-r border-slate-200 px-2.5 py-1.5 font-medium text-slate-900">
                      {v.vehicle_name}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1.5 font-mono">
                      {v.plate_number}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1.5">
                      {ownershipLabel(v.ownership)}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {v.trips}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-mono text-[#16A34A] tabular-nums">
                      {formatUSD(v.income)}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-mono text-[#DC2626] tabular-nums">
                      {formatUSD(v.expenses)}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1.5 text-right font-mono text-[#1D4E89] tabular-nums">
                      {formatUSD(v.rental)}
                    </td>
                    <td
                      className={`px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums ${
                        v.net_balance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {formatUSD(v.net_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={3} className="border-r border-slate-200 px-2.5 py-2">
                    {t('printFilingTotalRow')}
                  </td>
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right font-mono tabular-nums">
                    {monthlyOverview.trips}
                  </td>
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right font-mono text-[#16A34A] tabular-nums">
                    {formatUSD(monthlyOverview.income)}
                  </td>
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right font-mono text-[#DC2626] tabular-nums">
                    {formatUSD(monthlyOverview.expenses)}
                  </td>
                  <td className="border-r border-slate-200 px-2.5 py-2 text-right font-mono text-[#1D4E89] tabular-nums">
                    {formatUSD(monthlyOverview.rental)}
                  </td>
                  <td
                    className={`px-2.5 py-2 text-right font-mono tabular-nums ${
                      monthlyOverview.netBalance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {formatUSD(monthlyOverview.netBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Section 4: Fleet Snapshot & Physical Filing Sign-Off */}
        <footer className="print-avoid-break space-y-4 pt-1">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0B162C]">
              {t('printFilingFleetHeading')}
            </h2>
            <div className="grid grid-cols-4 border border-slate-300 text-xs">
              <div className="border-r border-slate-200 px-3 py-2">
                <div className="text-[10px] text-slate-500">{t('totalVehicles')}</div>
                <div className="font-mono font-bold tabular-nums">{fleet.totalVehicles}</div>
              </div>
              <div className="border-r border-slate-200 px-3 py-2">
                <div className="text-[10px] text-slate-500">{t('statusActive')}</div>
                <div className="font-mono font-bold text-[#16A34A] tabular-nums">
                  {fleet.activeVehicles}
                </div>
              </div>
              <div className="border-r border-slate-200 px-3 py-2">
                <div className="text-[10px] text-slate-500">{t('statusInactive')}</div>
                <div className="font-mono font-bold tabular-nums">{fleet.inactiveVehicles}</div>
              </div>
              <div className="px-3 py-2">
                <div className="text-[10px] text-slate-500">{t('statusMaintenance')}</div>
                <div className="font-mono font-bold tabular-nums">{fleet.maintenanceVehicles}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 pt-4 text-[11px] text-slate-700">
            <div>
              <div className="h-8 border-b border-slate-400" />
              <div className="mt-1 font-medium">{t('printFilingPreparedBy')}</div>
            </div>
            <div>
              <div className="h-8 border-b border-slate-400" />
              <div className="mt-1 font-medium">{t('printFilingApprovedBy')}</div>
            </div>
            <div>
              <div className="h-8 border-b border-slate-400" />
              <div className="mt-1 font-medium">{t('printFilingFolderCode')}</div>
            </div>
          </div>
        </footer>
      </section>
    </>
  );
}
