import { ClipboardList, Edit3, Info, Plus, Search, Trash2, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { FeedbackMessage } from '../components/ToastBanner';
import { ToastBanner } from '../components/ToastBanner';
import { useLanguage } from '../i18n';
import { apiFetch, createRequestId, formatUSD, getTodayDate } from '../lib/api';
import type { DailyWorkRecord, Vehicle } from '../types';

interface WorkFormState {
  work_date: string;
  vehicle_id: string;
  driver_name: string;
  cargo_description: string;
  destination: string;
  trips_count: string;
  income_received: string;
  notes: string;
}

export function DailyWorkPage() {
  const { t, ownershipLabel } = useLanguage();
  const [records, setRecords] = useState<DailyWorkRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState('all');
  const [search, setSearch] = useState('');

  const [editingRecord, setEditingRecord] = useState<DailyWorkRecord | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [requestId, setRequestId] = useState(createRequestId);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<WorkFormState>({
    work_date: getTodayDate(),
    vehicle_id: '',
    driver_name: '',
    cargo_description: '',
    destination: '',
    trips_count: '1',
    income_received: '',
    notes: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<DailyWorkRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      if (filterVehicleId !== 'all') params.set('vehicleId', filterVehicleId);
      if (search.trim()) params.set('search', search.trim());

      const [workRes, vehicleRes] = await Promise.all([
        apiFetch<{ records: DailyWorkRecord[] }>(`/api/daily-works?${params.toString()}`),
        apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles'),
      ]);

      setRecords(workRes.records);
      setVehicles(vehicleRes.vehicles);

      setForm((prev) => {
        if (prev.vehicle_id || vehicleRes.vehicles.length === 0) return prev;
        const firstActive =
          vehicleRes.vehicles.find((v) => v.status === 'Active') ?? vehicleRes.vehicles[0];
        return {
          ...prev,
          vehicle_id: firstActive.id,
          driver_name: firstActive.driver_name,
        };
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('loading'),
      });
    } finally {
      setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterVehicleId, search, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === form.vehicle_id),
    [vehicles, form.vehicle_id]
  );

  const totals = useMemo(() => {
    return records.reduce(
      (acc, r) => {
        acc.trips += r.trips_count;
        acc.income += r.income_received;
        return acc;
      },
      { trips: 0, income: 0 }
    );
  }, [records]);

  const handleVehicleChange = (vehicleId: string) => {
    const found = vehicles.find((v) => v.id === vehicleId);
    setForm((prev) => ({
      ...prev,
      vehicle_id: vehicleId,
      driver_name: found ? found.driver_name : prev.driver_name,
    }));
  };

  const resetForm = () => {
    setEditingRecord(null);
    setFormError(null);
    setRequestId(createRequestId());
    const defaultVehicle = vehicles.find((v) => v.status === 'Active') ?? vehicles[0];
    setForm({
      work_date: getTodayDate(),
      vehicle_id: defaultVehicle ? defaultVehicle.id : '',
      driver_name: defaultVehicle ? defaultVehicle.driver_name : '',
      cargo_description: '',
      destination: '',
      trips_count: '1',
      income_received: '',
      notes: '',
    });
  };

  const handleEdit = (rec: DailyWorkRecord) => {
    setEditingRecord(rec);
    setShowForm(true);
    setFormError(null);
    setForm({
      work_date: rec.work_date,
      vehicle_id: rec.vehicle_id,
      driver_name: rec.driver_name,
      cargo_description: rec.cargo_description,
      destination: rec.destination,
      trips_count: String(rec.trips_count),
      income_received: String(rec.income_received),
      notes: rec.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.vehicle_id) {
      setFormError(t('noVehiclesWarning'));
      return;
    }

    const trips = Number(form.trips_count);
    const income = Number(form.income_received);

    if (!Number.isInteger(trips) || trips < 1) {
      setFormError('Trips >= 1');
      return;
    }
    if (!Number.isFinite(income) || income < 0) {
      setFormError('Income >= 0');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        work_date: form.work_date,
        vehicle_id: form.vehicle_id,
        driver_name: form.driver_name.trim(),
        cargo_description: form.cargo_description.trim(),
        destination: form.destination.trim(),
        trips_count: trips,
        income_received: income,
        notes: form.notes.trim(),
        client_request_id: editingRecord ? undefined : requestId,
      };

      if (editingRecord) {
        await apiFetch(`/api/daily-works/${editingRecord.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'success', text: t('workUpdatedMsg') });
      } else {
        await apiFetch('/api/daily-works', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'success', text: t('workSavedMsg') });
      }

      resetForm();
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('loading'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/daily-works/${deleteTarget.id}`, { method: 'DELETE' });
      setFeedback({ type: 'success', text: t('workDeletedMsg') });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('deleteWorkTitle'),
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <ToastBanner message={feedback} onDismiss={() => setFeedback(null)} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('dailyWorkTitle')}</h2>
          <p className="text-sm text-slate-500">{t('dailyWorkSub')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (editingRecord) resetForm();
            setShowForm((prev) => !prev);
          }}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{showForm ? t('hideForm') : t('showForm')}</span>
        </button>
      </div>

      {/* Entry Form */}
      {showForm && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              {editingRecord ? t('editWorkEntry') : t('recordDailyWork')}
            </h3>
            {editingRecord && (
              <button
                type="button"
                onClick={resetForm}
                className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5" />
                {t('cancelEdit')}
              </button>
            )}
          </div>

          {vehicles.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {t('noVehiclesWarning')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('dateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.work_date}
                    onChange={(e) => setForm((f) => ({ ...f, work_date: e.target.value }))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('vehicleSelectLabel')}
                  </label>
                  <select
                    required
                    value={form.vehicle_id}
                    onChange={(e) => handleVehicleChange(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.plate_number}) — {ownershipLabel(v.ownership)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('driverNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.driver_name}
                    onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
                    placeholder={t('driverCol')}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('tripsCountLabel')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={form.trips_count}
                    onChange={(e) => setForm((f) => ({ ...f, trips_count: e.target.value }))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('cargoDescLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.cargo_description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cargo_description: e.target.value }))
                    }
                    placeholder={t('cargoDescPlaceholder')}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('destinationLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                    placeholder={t('destinationPlaceholder')}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('incomeReceivedLabel')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.income_received}
                    onChange={(e) => setForm((f) => ({ ...f, income_received: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('notesLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={t('notesPlaceholder')}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              {selectedVehicle?.ownership === 'rented' && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-slate-700">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4E89]" />
                  <span>
                    <strong>{selectedVehicle.name}</strong> (
                    <span className="font-mono font-medium">
                      {formatUSD(selectedVehicle.daily_rental_amount)}
                    </span>
                    ) {t('rentedDayNotice')}
                  </span>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-end">
                {editingRecord && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('cancel')}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#1D4E89] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#163D6B] disabled:opacity-60"
                >
                  {submitting
                    ? t('saving')
                    : editingRecord
                    ? t('updateWorkRecord')
                    : t('saveWorkRecord')}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Filters & Summary */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <div className="relative sm:col-span-2 lg:min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchWorkPlaceholder')}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
            />
          </div>

          <select
            value={filterVehicleId}
            onChange={(e) => setFilterVehicleId(e.target.value)}
            aria-label={t('vehicleFilterLabel')}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-700 focus:border-[#1D4E89] focus:outline-none sm:text-sm"
          >
            <option value="all">{t('allVehicles')}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.plate_number})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              aria-label={t('startDateLabel')}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700 focus:border-[#1D4E89] focus:outline-none sm:w-auto"
            />
            <span className="text-xs text-slate-400">{t('dateTo')}</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              aria-label={t('endDateLabel')}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700 focus:border-[#1D4E89] focus:outline-none sm:w-auto"
            />
          </div>

          {(filterStartDate || filterEndDate || filterVehicleId !== 'all' || search) && (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterVehicleId('all');
                setSearch('');
              }}
              className="min-h-[36px] text-left text-xs font-medium text-[#1D4E89] hover:underline"
            >
              {t('reset')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 tabular-nums">
          <span>
            {t('entriesCount')}: <strong className="font-mono text-slate-900">{records.length}</strong>
          </span>
          <span>
            {t('tripsTotal')}: <strong className="font-mono text-slate-900">{totals.trips}</strong>
          </span>
          <span>
            {t('incomeCol')}:{' '}
            <strong className="font-mono text-[#16A34A]">{formatUSD(totals.income)}</strong>
          </span>
        </div>
      </div>

      {/* Records List */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('loading')}</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <ClipboardList className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">{t('noWorkRecordsFound')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('noWorkRecordsSub')}</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {records.map((rec) => (
                <div key={rec.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-slate-500">{rec.work_date}</div>
                      <div className="font-semibold text-slate-900">{rec.vehicle_name}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {rec.plate_number} · {ownershipLabel(rec.ownership)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-base font-bold text-[#16A34A] tabular-nums">
                        {formatUSD(rec.income_received)}
                      </div>
                      <div className="font-mono text-xs text-slate-500 tabular-nums">
                        {rec.trips_count} {t('tripsCol')}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-800">
                    {rec.cargo_description} → {rec.destination}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-xs text-slate-500">
                      {rec.driver_name}
                      {rec.notes ? ` · ${rec.notes}` : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(rec)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-[#1D4E89] hover:bg-slate-50"
                        aria-label={t('edit')}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(rec)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                        aria-label={t('delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                    <th className="px-5 py-3">{t('dateLabel').replace(' *', '')}</th>
                    <th className="px-4 py-3">{t('vehicleCol')}</th>
                    <th className="px-4 py-3">{t('driverCol')}</th>
                    <th className="px-4 py-3">{t('cargoAndNotesCol')}</th>
                    <th className="px-4 py-3">{t('destinationCol')}</th>
                    <th className="px-4 py-3 text-right">{t('tripsCol')}</th>
                    <th className="px-4 py-3 text-right">{t('incomeCol')}</th>
                    <th className="px-5 py-3 text-right">{t('actionsCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-800 whitespace-nowrap">
                        {rec.work_date}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{rec.vehicle_name}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {rec.plate_number} · {ownershipLabel(rec.ownership)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{rec.driver_name}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-slate-800">{rec.cargo_description}</div>
                        {rec.notes && <div className="text-xs text-slate-500">{rec.notes}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{rec.destination}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-800 tabular-nums">
                        {rec.trips_count}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-[#16A34A] tabular-nums">
                        {formatUSD(rec.income_received)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(rec)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#1D4E89]"
                            title={t('edit')}
                            aria-label={t('edit')}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(rec)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            title={t('delete')}
                            aria-label={t('delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('deleteWorkTitle')}
        description={`${deleteTarget?.vehicle_name ?? ''} (${deleteTarget?.work_date ?? ''}, ${formatUSD(
          deleteTarget?.income_received ?? 0
        )}) — ${t('deleteWorkDesc')}`}
        confirmLabel={t('delete')}
        busy={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
