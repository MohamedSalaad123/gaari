import { Edit3, Eye, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { FeedbackMessage } from '../components/ToastBanner';
import { ToastBanner } from '../components/ToastBanner';
import { useLanguage } from '../i18n';
import { apiFetch, formatUSD } from '../lib/api';
import type { Vehicle, VehicleOwnership, VehicleStatus } from '../types';

const VEHICLE_TYPE_OPTIONS = [
  { value: 'Dump Truck', key: 'vt_dump' as const },
  { value: 'Flatbed Truck', key: 'vt_flatbed' as const },
  { value: 'Box Truck', key: 'vt_box' as const },
  { value: 'Semi-Trailer', key: 'vt_semi' as const },
  { value: 'Cargo Van', key: 'vt_van' as const },
  { value: 'Tanker Truck', key: 'vt_tanker' as const },
  { value: 'Pickup Cargo', key: 'vt_pickup' as const },
  { value: 'Other', key: 'vt_other' as const },
];

interface VehicleFormState {
  name: string;
  plate_number: string;
  vehicle_type: string;
  driver_name: string;
  driver_phone: string;
  ownership: VehicleOwnership;
  daily_rental_amount: string;
  status: VehicleStatus;
}

const EMPTY_FORM: VehicleFormState = {
  name: '',
  plate_number: '',
  vehicle_type: 'Dump Truck',
  driver_name: '',
  driver_phone: '',
  ownership: 'company',
  daily_rental_amount: '',
  status: 'Active',
};

export function VehiclesPage() {
  const { t, statusLabel, ownershipLabel } = useLanguage();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  const [search, setSearch] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | VehicleOwnership>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [viewingVehicle, setViewingVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const translateVehicleType = (vt: string) => {
    const found = VEHICLE_TYPE_OPTIONS.find((o) => o.value === vt);
    return found ? t(found.key) : vt;
  };

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles');
      setVehicles(res.vehicles);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('loading'),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (ownershipFilter !== 'all' && v.ownership !== ownershipFilter) return false;
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.plate_number.toLowerCase().includes(q) ||
        v.driver_name.toLowerCase().includes(q) ||
        v.vehicle_type.toLowerCase().includes(q)
      );
    });
  }, [vehicles, search, ownershipFilter, statusFilter]);

  const openAddModal = () => {
    setEditingVehicle(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (v: Vehicle) => {
    setEditingVehicle(v);
    setForm({
      name: v.name,
      plate_number: v.plate_number,
      vehicle_type: v.vehicle_type,
      driver_name: v.driver_name,
      driver_phone: v.driver_phone,
      ownership: v.ownership,
      daily_rental_amount: v.ownership === 'rented' ? String(v.daily_rental_amount) : '',
      status: v.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (
      !form.name.trim() ||
      !form.plate_number.trim() ||
      !form.driver_name.trim() ||
      !form.driver_phone.trim()
    ) {
      setFormError(t('errFillVehicleFields'));
      return;
    }

    const rentalAmount = form.ownership === 'rented' ? Number(form.daily_rental_amount) : 0;
    if (form.ownership === 'rented' && (!Number.isFinite(rentalAmount) || rentalAmount <= 0)) {
      setFormError(t('errRentalPositive'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        plate_number: form.plate_number.trim().toUpperCase(),
        vehicle_type: form.vehicle_type.trim(),
        driver_name: form.driver_name.trim(),
        driver_phone: form.driver_phone.trim(),
        ownership: form.ownership,
        daily_rental_amount: rentalAmount,
        status: form.status,
      };

      if (editingVehicle) {
        await apiFetch(`/api/vehicles/${editingVehicle.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'success', text: t('vehicleUpdatedMsg') });
      } else {
        await apiFetch('/api/vehicles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'success', text: t('vehicleAddedMsg') });
      }

      setModalOpen(false);
      await loadVehicles();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('errFillVehicleFields'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/vehicles/${deleteTarget.id}`, { method: 'DELETE' });
      setFeedback({ type: 'success', text: t('vehicleDeletedMsg') });
      setDeleteTarget(null);
      await loadVehicles();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('deleteVehicleTitle'),
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const statusColor = (status: VehicleStatus) =>
    status === 'Active'
      ? 'text-[#16A34A]'
      : status === 'Maintenance'
      ? 'text-amber-700'
      : 'text-slate-500';

  return (
    <div className="space-y-5">
      <ToastBanner message={feedback} onDismiss={() => setFeedback(null)} />

      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('registeredFleet')}</h2>
          <p className="text-sm text-slate-500">{t('registeredFleetSub')}</p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#163D6B] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{t('registerVehicle')}</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:flex-wrap md:items-center">
        <div className="relative flex-1 md:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchVehiclesPlaceholder')}
            className="min-h-[44px] w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex sm:items-center">
          {(['all', 'company', 'rented'] as const).map((own) => (
            <button
              key={own}
              type="button"
              onClick={() => setOwnershipFilter(own)}
              className={`min-h-[38px] rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                ownershipFilter === own
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {own === 'all'
                ? t('allOwnership')
                : own === 'company'
                ? t('companyOwned')
                : t('rented')}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | VehicleStatus)}
          aria-label={t('vehicleStatusLabel')}
          className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-700 focus:border-[#1D4E89] focus:outline-none sm:text-sm"
        >
          <option value="all">{t('allStatuses')}</option>
          <option value="Active">{t('statusActive')}</option>
          <option value="Inactive">{t('statusInactive')}</option>
          <option value="Maintenance">{t('statusMaintenance')}</option>
        </select>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('loading')}</div>
        ) : filteredVehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Truck className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {vehicles.length === 0 ? t('noVehiclesYet') : t('noMatchingVehicles')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {vehicles.length === 0 ? t('noVehiclesSub') : t('adjustFiltersSub')}
            </p>
            {vehicles.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 min-h-[44px] rounded-lg bg-[#1D4E89] px-4 py-2 text-xs font-medium text-white hover:bg-[#163D6B]"
              >
                {t('registerFirstVehicle')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filteredVehicles.map((v) => (
                <div key={v.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{v.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">
                        {v.plate_number} · {translateVehicleType(v.vehicle_type)}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${statusColor(v.status)}`}>
                      {statusLabel(v.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <div className="text-slate-400">{t('driverCol')}</div>
                      <div className="font-medium text-slate-800">{v.driver_name}</div>
                      <div className="font-mono text-slate-500">{v.driver_phone}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">{t('ownershipCol')}</div>
                      <div className="font-medium text-slate-800">
                        {ownershipLabel(v.ownership)}
                      </div>
                      {v.ownership === 'rented' && (
                        <div className="font-mono text-[#1D4E89] tabular-nums">
                          {formatUSD(v.daily_rental_amount)}/d
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <div className="text-xs text-slate-500">
                      {t('totalIncomeCol')}:{' '}
                      <span className="font-mono font-semibold text-[#16A34A] tabular-nums">
                        {formatUSD(v.total_income ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingVehicle(v)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        aria-label={`${t('view')} ${v.name}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(v)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-[#1D4E89] hover:bg-slate-50"
                        aria-label={`${t('edit')} ${v.name}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(v)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                        aria-label={`${t('delete')} ${v.name}`}
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
                    <th className="px-5 py-3">{t('vehicleCol')}</th>
                    <th className="px-4 py-3">{t('plateCol')}</th>
                    <th className="px-4 py-3">{t('driverCol')}</th>
                    <th className="px-4 py-3">{t('ownershipCol')}</th>
                    <th className="px-4 py-3 text-right">{t('dailyRentalCol')}</th>
                    <th className="px-4 py-3">{t('statusCol')}</th>
                    <th className="px-4 py-3 text-right">{t('totalIncomeCol')}</th>
                    <th className="px-5 py-3 text-right">{t('actionsCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">{v.name}</div>
                        <div className="text-xs text-slate-500">
                          {translateVehicleType(v.vehicle_type)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800">
                        {v.plate_number}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-slate-800">{v.driver_name}</div>
                        <div className="font-mono text-xs text-slate-500">{v.driver_phone}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{ownershipLabel(v.ownership)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-800 tabular-nums">
                        {v.ownership === 'rented' ? formatUSD(v.daily_rental_amount) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold ${statusColor(v.status)}`}>
                          {statusLabel(v.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-[#16A34A] tabular-nums">
                        {formatUSD(v.total_income ?? 0)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingVehicle(v)}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={t('view')}
                            aria-label={`${t('view')} ${v.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(v)}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1D4E89]"
                            title={t('edit')}
                            aria-label={`${t('edit')} ${v.name}`}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(v)}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                            title={t('delete')}
                            aria-label={`${t('delete')} ${v.name}`}
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingVehicle ? t('editVehicle') : t('registerNewVehicle')}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('vehicleNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Volvo FH16 #01"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('plateNumberLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.plate_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, plate_number: e.target.value.toUpperCase() }))
                    }
                    placeholder="TRK-4082"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base uppercase focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('vehicleTypeLabel')}
                  </label>
                  <select
                    value={form.vehicle_type}
                    onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  >
                    {VEHICLE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.key)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('vehicleStatusLabel')}
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as VehicleStatus }))
                    }
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  >
                    <option value="Active">{t('statusActive')}</option>
                    <option value="Inactive">{t('statusInactive')}</option>
                    <option value="Maintenance">{t('statusMaintenance')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('driverNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.driver_name}
                    onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
                    placeholder="Axmed Maxamed"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('driverPhoneLabel')}
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.driver_phone}
                    onChange={(e) => setForm((f) => ({ ...f, driver_phone: e.target.value }))}
                    placeholder="+252 61 5000000"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('ownershipLabel')}
                  </label>
                  <select
                    value={form.ownership}
                    onChange={(e) => {
                      const own = e.target.value as VehicleOwnership;
                      setForm((f) => ({
                        ...f,
                        ownership: own,
                        daily_rental_amount: own === 'company' ? '' : f.daily_rental_amount,
                      }));
                    }}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  >
                    <option value="company">{t('companyOwned')}</option>
                    <option value="rented">{t('rented')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('dailyRentalAmountLabel')} {form.ownership === 'rented' ? '*' : ''}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={form.ownership === 'company'}
                    required={form.ownership === 'rented'}
                    value={form.ownership === 'company' ? '0.00' : form.daily_rental_amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, daily_rental_amount: e.target.value }))
                    }
                    placeholder="0.00"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base focus:border-[#1D4E89] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#1D4E89] px-5 py-2 text-sm font-medium text-white hover:bg-[#163D6B] disabled:opacity-60"
                >
                  {submitting
                    ? t('saving')
                    : editingVehicle
                    ? t('saveChanges')
                    : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Vehicle Details Modal */}
      {viewingVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl sm:max-w-md sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{viewingVehicle.name}</h3>
                <p className="font-mono text-xs text-slate-500">{viewingVehicle.plate_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingVehicle(null)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                [t('vehicleTypeLabel').replace(' *', ''), translateVehicleType(viewingVehicle.vehicle_type)],
                [t('driverCol'), viewingVehicle.driver_name],
                [t('driverPhoneLabel').replace(' *', ''), viewingVehicle.driver_phone],
                [t('ownershipCol'), ownershipLabel(viewingVehicle.ownership)],
                [
                  t('dailyRentalCol'),
                  viewingVehicle.ownership === 'rented'
                    ? formatUSD(viewingVehicle.daily_rental_amount)
                    : '— ($0.00)',
                ],
                [t('statusCol'), statusLabel(viewingVehicle.status)],
                [t('workingDaysLogged'), String(viewingVehicle.working_days ?? 0)],
                [t('totalTripsLogged'), String(viewingVehicle.total_trips ?? 0)],
                [t('totalIncomeGenerated'), formatUSD(viewingVehicle.total_income ?? 0)],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-900 tabular-nums">{val}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingVehicle(null)}
                className="min-h-[44px] w-full rounded-lg bg-[#0B162C] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('deleteVehicleTitle')}
        description={`${deleteTarget?.name ?? ''} (${deleteTarget?.plate_number ?? ''}) — ${t('deleteVehicleDesc')}`}
        confirmLabel={t('delete')}
        busy={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
