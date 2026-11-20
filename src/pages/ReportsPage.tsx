import { BarChart3, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeedbackMessage } from '../components/ToastBanner';
import { ToastBanner } from '../components/ToastBanner';
import { useLanguage } from '../i18n';
import { apiFetch, formatUSD, getMonthStartDate, getTodayDate } from '../lib/api';
import {
  exportReportToExcel,
  exportReportToPDF,
  formatCellValue,
  getColumnsForReport,
  REPORT_LABELS_BY_LANG,
} from '../lib/exportUtils';
import type { ReportData, ReportType, Vehicle } from '../types';

const REPORT_TYPE_IDS: ReportType[] = [
  'daily',
  'weekly',
  'monthly',
  'vehicle_income',
  'expense',
  'rental_payment',
];

export function ReportsPage() {
  const { t, lang, reportLabel } = useLanguage();

  const [reportType, setReportType] = useState<ReportType>('daily');
  const [startDate, setStartDate] = useState(getMonthStartDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [vehicleId, setVehicleId] = useState('all');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  const loadVehicles = useCallback(async () => {
    try {
      const res = await apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles');
      setVehicles(res.vehicles);
    } catch {
      // Ignore vehicle dropdown error if main report catches it
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams({
        type: reportType,
        startDate,
        endDate,
        vehicleId,
      });
      const res = await apiFetch<ReportData>(`/api/reports?${params.toString()}`);
      setReport(res);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [reportType, startDate, endDate, vehicleId, t]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const applyPreset = (preset: 'today' | 'week' | 'month' | 'year') => {
    const today = getTodayDate();
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'week') {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 6);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(today);
    } else if (preset === 'month') {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    } else {
      setStartDate(`${today.slice(0, 4)}-01-01`);
      setEndDate(today);
    }
  };

  const selectedVehicleLabel = useMemo(() => {
    if (vehicleId === 'all') return t('allVehicles');
    const found = vehicles.find((v) => v.id === vehicleId);
    return found ? `${found.name} (${found.plate_number})` : t('vehicleCol');
  }, [vehicleId, vehicles, t]);

  const columns = useMemo(() => getColumnsForReport(reportType, lang), [reportType, lang]);
  const fullReportTitle = REPORT_LABELS_BY_LANG[lang][reportType];

  return (
    <div className="space-y-6">
      <div className="no-print">
        <ToastBanner message={feedback} onDismiss={() => setFeedback(null)} />
      </div>

      {/* Header & Export Actions */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('reportsTitle')}</h2>
          <p className="text-sm text-slate-500">{t('reportsSub')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!report || loading}
            onClick={() => report && exportReportToPDF(report, selectedVehicleLabel, lang)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4 text-red-600" />
            <span>{t('exportPdf')}</span>
          </button>

          <button
            type="button"
            disabled={!report || loading}
            onClick={() => report && exportReportToExcel(report, selectedVehicleLabel, lang)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#16A34A]" />
            <span>{t('exportExcel')}</span>
          </button>

          <button
            type="button"
            disabled={!report || loading}
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#1D4E89] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#163D6B] disabled:opacity-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>{t('printReport')}</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector & Filters */}
      <div className="no-print space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {REPORT_TYPE_IDS.map((rtId) => (
            <button
              key={rtId}
              type="button"
              onClick={() => setReportType(rtId)}
              className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                reportType === rtId
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {reportLabel(rtId)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500">
                {t('startDateLabel')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm text-slate-800 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500">
                {t('endDateLabel')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm text-slate-800 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500">
                {t('vehicleFilterLabel')}
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-[#1D4E89] focus:outline-none"
              >
                <option value="all">{t('allVehicles')}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plate_number})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'today', label: t('presetToday') },
              { id: 'week', label: t('presetWeek') },
              { id: 'month', label: t('presetMonth') },
              { id: 'year', label: t('presetYear') },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id as 'today' | 'week' | 'month' | 'year')}
                className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Printable Header (visible on print) */}
      <div className="hidden print-only mb-4 border-b border-slate-300 pb-3">
        <h1 className="text-xl font-bold text-slate-900">HaulLedger — {fullReportTitle}</h1>
        <p className="mt-1 text-xs text-slate-600">
          {startDate} {t('dateTo')} {endDate} · {t('vehicleCol')}: {selectedVehicleLabel}
        </p>
      </div>

      {/* Report Summary Strip */}
      {report && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('periodIncome')}</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#16A34A] tabular-nums sm:text-xl">
              {formatUSD(report.summary.totalIncome)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('periodExpenses')}</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#DC2626] tabular-nums sm:text-xl">
              {formatUSD(report.summary.totalExpenses)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('periodRental')}</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#1D4E89] tabular-nums sm:text-xl">
              {formatUSD(report.summary.totalRental)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{t('periodNet')}</div>
            <div
              className={`mt-1 font-mono text-lg font-bold tabular-nums sm:text-xl ${
                report.summary.netBalance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {formatUSD(report.summary.netBalance)}
            </div>
          </div>
        </div>
      )}

      {/* Report Data Container */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#1D4E89]" />
            <h3 className="text-base font-semibold text-slate-900">{fullReportTitle}</h3>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {report ? `${report.rows.length} ${t('rowsCountLabel')}` : ''}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('generatingReport')}</div>
        ) : !report || report.rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">{t('noReportRows')}</div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {report.rows.map((row, idx) => (
                <div key={idx} className="space-y-2 p-4">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    {columns.map((col) => {
                      const raw = row[col.key];
                      const formatted = formatCellValue(raw, col, lang);
                      const isPositiveIncome = col.key === 'income';
                      const isExpenseOrDue =
                        col.key === 'expenses' ||
                        col.key === 'amount' ||
                        (col.key === 'outstanding_balance' && Number(raw) > 0);
                      const isNet = col.key === 'net_balance';
                      const colorClass = isPositiveIncome
                        ? 'text-[#16A34A] font-semibold'
                        : isExpenseOrDue
                        ? 'text-[#DC2626] font-semibold'
                        : isNet
                        ? Number(raw) >= 0
                          ? 'text-[#16A34A] font-semibold'
                          : 'text-[#DC2626] font-semibold'
                        : 'text-slate-900 font-medium';

                      return (
                        <div key={col.key}>
                          <div className="text-[11px] text-slate-500">{col.label}</div>
                          <div
                            className={`mt-0.5 ${
                              col.align === 'right' ||
                              col.key === 'period' ||
                              col.key === 'plate_number' ||
                              col.key === 'expense_date'
                                ? 'font-mono tabular-nums'
                                : ''
                            } ${colorClass}`}
                          >
                            {formatted || '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 first:pl-5 last:pr-5 ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      {columns.map((col) => {
                        const raw = row[col.key];
                        const formatted = formatCellValue(raw, col, lang);
                        const isPositiveIncome = col.key === 'income';
                        const isExpenseOrDue =
                          col.key === 'expenses' ||
                          col.key === 'amount' ||
                          (col.key === 'outstanding_balance' && Number(raw) > 0);
                        const isNet = col.key === 'net_balance';
                        const netColor =
                          isNet && Number(raw) >= 0
                            ? 'text-[#16A34A] font-semibold'
                            : isNet
                            ? 'text-[#DC2626] font-semibold'
                            : '';

                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-3 first:pl-5 last:pr-5 ${
                              col.align === 'right'
                                ? 'text-right font-mono tabular-nums'
                                : col.key === 'plate_number' ||
                                  col.key === 'period' ||
                                  col.key === 'expense_date'
                                ? 'font-mono text-xs text-slate-800'
                                : 'text-slate-800'
                            } ${isPositiveIncome ? 'font-medium text-[#16A34A]' : ''} ${
                              isExpenseOrDue ? 'font-medium text-[#DC2626]' : ''
                            } ${netColor}`}
                          >
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
