import { CreditCard, DollarSign, Info, Trash2, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { FeedbackMessage } from '../components/ToastBanner';
import { ToastBanner } from '../components/ToastBanner';
import { useLanguage } from '../i18n';
import { apiFetch, createRequestId, formatUSD, getTodayDate } from '../lib/api';
import type { RentalObligationRow, RentalPaymentRow, RentalVehicleSummary } from '../types';

export function RentalPaymentsPage() {
  const { t, lang, paymentMethodLabel } = useLanguage();

  const [vehicles, setVehicles] = useState<RentalVehicleSummary[]>([]);
  const [totals, setTotals] = useState({
    totalWorkingDays: 0,
    totalRentalDue: 0,
    totalAmountPaid: 0,
    totalOutstanding: 0,
  });
  const [obligations, setObligations] = useState<RentalObligationRow[]>([]);
  const [payments, setPayments] = useState<RentalPaymentRow[]>([]);
  const [activeTab, setActiveTab] = useState<'ledger' | 'obligations' | 'history'>('ledger');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  const [payModalVehicle, setPayModalVehicle] = useState<RentalVehicleSummary | null>(null);
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [requestId, setRequestId] = useState(createRequestId);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<RentalPaymentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRentals = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, obRes, payRes] = await Promise.all([
        apiFetch<{
          vehicles: RentalVehicleSummary[];
          totals: {
            totalWorkingDays: number;
            totalRentalDue: number;
            totalAmountPaid: number;
            totalOutstanding: number;
          };
        }>('/api/rentals/summary'),
        apiFetch<{ obligations: RentalObligationRow[] }>('/api/rentals/obligations'),
        apiFetch<{ payments: RentalPaymentRow[] }>('/api/rentals/payments'),
      ]);
      setVehicles(summaryRes.vehicles);
      setTotals(summaryRes.totals);
      setObligations(obRes.obligations);
      setPayments(payRes.payments);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRentals();
  }, [loadRentals]);

  const openPaymentModal = (v: RentalVehicleSummary) => {
    setPayModalVehicle(v);
    setPaymentDate(getTodayDate());
    setAmountPaid(v.outstanding_balance > 0 ? String(v.outstanding_balance) : '');
    setPaymentMethod('Cash');
    setNotes('');
    setModalError(null);
    setRequestId(createRequestId());
  };

  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payModalVehicle) return;
    setModalError(null);

    const amt = Number(amountPaid);
    if (!Number.isFinite(amt) || amt <= 0) {
      setModalError(
        lang === 'so'
          ? 'Lacagta la bixinayo waa inay ka badnaataa $0.00.'
          : 'Payment amount must be greater than $0.00.'
      );
      return;
    }
    if (amt > payModalVehicle.outstanding_balance) {
      setModalError(
        lang === 'so'
          ? `Lacagtu kama badnaan karto haraaga hadhsan (${formatUSD(
              payModalVehicle.outstanding_balance
            )}).`
          : `Payment cannot exceed the remaining balance of ${formatUSD(
              payModalVehicle.outstanding_balance
            )}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/rentals/payments', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: payModalVehicle.vehicle_id,
          payment_date: paymentDate,
          amount_paid: amt,
          payment_method: paymentMethod,
          notes: notes.trim(),
          client_request_id: requestId,
        }),
      });
      setFeedback({
        type: 'success',
        text: `${t('paymentRecordedMsg')} (${formatUSD(amt)} · ${payModalVehicle.name})`,
      });
      setPayModalVehicle(null);
      await loadRentals();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('errAuthFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/rentals/payments/${deleteTarget.id}`, { method: 'DELETE' });
      setFeedback({ type: 'success', text: t('paymentDeletedMsg') });
      setDeleteTarget(null);
      await loadRentals();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastBanner message={feedback} onDismiss={() => setFeedback(null)} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('rentalTitle')}</h2>
          <p className="text-sm text-slate-500">{t('rentalSub')}</p>
        </div>
      </div>

      {/* Totals Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">{t('totalWorkingDaysRented')}</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {totals.totalWorkingDays}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">{t('totalRentalDue')}</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#1D4E89] tabular-nums">
            {formatUSD(totals.totalRentalDue)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">{t('totalAmountPaid')}</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#16A34A] tabular-nums">
            {formatUSD(totals.totalAmountPaid)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">{t('outstandingBalance')}</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              totals.totalOutstanding > 0 ? 'text-[#DC2626]' : 'text-slate-900'
            }`}
          >
            {formatUSD(totals.totalOutstanding)}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4E89]" />
        <span>{t('rentalRuleNote')}</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1 sm:inline-flex">
        {[
          { id: 'ledger', label: `${t('tabRentedVehicles')} (${vehicles.length})` },
          { id: 'obligations', label: `${t('tabWorkingDaysLog')} (${obligations.length})` },
          { id: 'history', label: `${t('tabPaymentHistory')} (${payments.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as 'ledger' | 'obligations' | 'history')}
            className={`min-h-[38px] flex-1 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap sm:flex-initial ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t('loading')}
        </div>
      ) : activeTab === 'ledger' ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          {vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <CreditCard className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">{t('noRentedVehicles')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('noRentedVehiclesSub')}</p>
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="divide-y divide-slate-100 md:hidden">
                {vehicles.map((v) => (
                  <div key={v.vehicle_id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{v.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">
                          {v.plate_number} · {v.driver_name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500">{t('outstandingCol')}</div>
                        <div
                          className={`font-mono text-sm font-bold tabular-nums ${
                            v.outstanding_balance > 0 ? 'text-[#DC2626]' : 'text-slate-600'
                          }`}
                        >
                          {formatUSD(v.outstanding_balance)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                      <div>
                        <span className="text-slate-500">{t('dailyObligationCol')}: </span>
                        <span className="font-mono font-medium text-slate-800 tabular-nums">
                          {formatUSD(v.daily_rental_amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t('workingDaysCol')}: </span>
                        <span className="font-mono font-medium text-slate-800 tabular-nums">
                          {v.working_days}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t('totalDueCol')}: </span>
                        <span className="font-mono font-semibold text-[#1D4E89] tabular-nums">
                          {formatUSD(v.total_rental_due)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t('amountPaidCol')}: </span>
                        <span className="font-mono font-semibold text-[#16A34A] tabular-nums">
                          {formatUSD(v.amount_paid)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={v.outstanding_balance <= 0}
                      onClick={() => openPaymentModal(v)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#1D4E89] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#163D6B] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      <DollarSign className="h-4 w-4" />
                      <span>
                        {v.outstanding_balance > 0 ? t('recordPaymentBtn') : t('settledLabel')}
                      </span>
                    </button>
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
                      <th className="px-4 py-3 text-right">{t('dailyObligationCol')}</th>
                      <th className="px-4 py-3 text-right">{t('workingDaysCol')}</th>
                      <th className="px-4 py-3 text-right">{t('totalDueCol')}</th>
                      <th className="px-4 py-3 text-right">{t('amountPaidCol')}</th>
                      <th className="px-4 py-3 text-right">{t('outstandingCol')}</th>
                      <th className="px-5 py-3 text-right">{t('actionsCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vehicles.map((v) => (
                      <tr key={v.vehicle_id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-900">{v.name}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {v.plate_number} · {v.vehicle_type}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{v.driver_name}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                          {formatUSD(v.daily_rental_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-800 tabular-nums">
                          {v.working_days}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-medium text-[#1D4E89] tabular-nums">
                          {formatUSD(v.total_rental_due)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-medium text-[#16A34A] tabular-nums">
                          {formatUSD(v.amount_paid)}
                        </td>
                        <td
                          className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums ${
                            v.outstanding_balance > 0 ? 'text-[#DC2626]' : 'text-slate-600'
                          }`}
                        >
                          {formatUSD(v.outstanding_balance)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={v.outstanding_balance <= 0}
                            onClick={() => openPaymentModal(v)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4E89] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#163D6B] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            <span>
                              {v.outstanding_balance > 0 ? t('recordPaymentBtn') : t('settledLabel')}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'obligations' ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          {obligations.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{t('noObligationsYet')}</div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="divide-y divide-slate-100 md:hidden">
                {obligations.map((ob) => (
                  <div key={ob.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{ob.vehicle_name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">
                        {ob.work_date} · {ob.plate_number} · {ob.trips_count} {t('tripsCol')}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-semibold text-[#1D4E89] tabular-nums">
                      {formatUSD(ob.daily_rate)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="px-5 py-3">{t('workingDateCol')}</th>
                      <th className="px-4 py-3">{t('vehicleCol')}</th>
                      <th className="px-4 py-3 text-right">{t('tripsOnDateCol')}</th>
                      <th className="px-5 py-3 text-right">{t('dailyObligationCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {obligations.map((ob) => (
                      <tr key={ob.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-800">{ob.work_date}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-medium text-slate-900">{ob.vehicle_name}</span>
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {ob.plate_number}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                          {ob.trips_count}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-[#1D4E89] tabular-nums">
                          {formatUSD(ob.daily_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          {payments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{t('noPaymentsYet')}</div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="divide-y divide-slate-100 md:hidden">
                {payments.map((p) => (
                  <div key={p.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.vehicle_name}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">
                          {p.payment_date} · {p.plate_number} · {paymentMethodLabel(p.payment_method)}
                        </div>
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                        {formatUSD(p.amount_paid)}
                      </div>
                    </div>
                    {p.notes && <p className="text-xs text-slate-600">{p.notes}</p>}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t('delete')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="px-5 py-3">{t('paymentDateCol')}</th>
                      <th className="px-4 py-3">{t('vehicleCol')}</th>
                      <th className="px-4 py-3">{t('methodCol')}</th>
                      <th className="px-4 py-3">{t('notesLabel')}</th>
                      <th className="px-4 py-3 text-right">{t('amountPaidCol')}</th>
                      <th className="px-5 py-3 text-right">{t('actionsCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-800">
                          {p.payment_date}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-medium text-slate-900">{p.vehicle_name}</span>
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {p.plate_number}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">
                          {paymentMethodLabel(p.payment_method)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{p.notes || '—'}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-semibold text-[#16A34A] tabular-nums">
                          {formatUSD(p.amount_paid)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title={t('delete')}
                            aria-label={t('delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {payModalVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t('recordRentalPaymentTitle')}
                </h3>
                <p className="text-xs text-slate-500">
                  {payModalVehicle.name} ({payModalVehicle.plate_number})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalVehicle(null)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">{t('outstandingBalance')}</span>
              <span className="font-mono font-bold text-[#DC2626] tabular-nums">
                {formatUSD(payModalVehicle.outstanding_balance)}
              </span>
            </div>

            {modalError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                {modalError}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('paymentDateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-[#1D4E89] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('paymentMethodLabel')}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1D4E89] focus:outline-none"
                  >
                    <option value="Cash">{t('methodCash')}</option>
                    <option value="Bank Transfer">{t('methodBank')}</option>
                    <option value="Mobile Money">{t('methodMobile')}</option>
                    <option value="Check">{t('methodCheck')}</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    {t('amountPaidUsdLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setAmountPaid(String(payModalVehicle.outstanding_balance))}
                    className="text-xs font-medium text-[#1D4E89] hover:underline"
                  >
                    {t('payFullBalance')}
                  </button>
                </div>
                <input
                  type="number"
                  min="0.01"
                  max={payModalVehicle.outstanding_balance}
                  step="0.01"
                  required
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{t('notesLabel')}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('notesPlaceholder')}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setPayModalVehicle(null)}
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-medium text-white hover:bg-[#163D6B] disabled:opacity-60"
                >
                  {submitting ? t('processing') : t('confirmPaymentBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('deletePaymentTitle')}
        description={`${t('deletePaymentDesc')} (${formatUSD(deleteTarget?.amount_paid ?? 0)} · ${
          deleteTarget?.payment_date ?? ''
        } · ${deleteTarget?.vehicle_name ?? ''})`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        busy={deleting}
        onConfirm={() => void handleConfirmDeletePayment()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
