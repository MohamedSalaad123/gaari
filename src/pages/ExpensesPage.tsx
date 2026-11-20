import { Edit3, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { FeedbackMessage } from '../components/ToastBanner';
import { ToastBanner } from '../components/ToastBanner';
import { useLanguage } from '../i18n';
import { apiFetch, createRequestId, formatUSD, getTodayDate } from '../lib/api';
import type { ExpenseCategory, ExpenseRecord, Vehicle } from '../types';
import { EXPENSE_CATEGORIES } from '../types';

interface ExpenseFormState {
  expense_date: string;
  vehicle_id: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
}

export function ExpensesPage() {
  const { t, categoryLabel } = useLanguage();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterVehicleId, setFilterVehicleId] = useState('all');
  const [filterCategory, setFilterCategory] = useState<'all' | ExpenseCategory>('all');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(true);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [requestId, setRequestId] = useState(createRequestId);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<ExpenseFormState>({
    expense_date: getTodayDate(),
    vehicle_id: '',
    category: 'Fuel',
    description: '',
    amount: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      if (filterVehicleId !== 'all') params.set('vehicleId', filterVehicleId);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (search.trim()) params.set('search', search.trim());

      const [expRes, vehRes] = await Promise.all([
        apiFetch<{ expenses: ExpenseRecord[] }>(`/api/expenses?${params.toString()}`),
        apiFetch<{ vehicles: Vehicle[] }>('/api/vehicles'),
      ]);

      setExpenses(expRes.expenses);
      setVehicles(vehRes.vehicles);

      setForm((prev) => {
        if (prev.vehicle_id || vehRes.vehicles.length === 0) return prev;
        return { ...prev, vehicle_id: vehRes.vehicles[0].id };
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('loading'),
      });
    } finally {
      setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterVehicleId, filterCategory, search, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const resetForm = () => {
    setEditingExpense(null);
    setFormError(null);
    setRequestId(createRequestId());
    setForm({
      expense_date: getTodayDate(),
      vehicle_id: vehicles[0] ? vehicles[0].id : '',
      category: 'Fuel',
      description: '',
      amount: '',
    });
  };

  const handleEdit = (exp: ExpenseRecord) => {
    setEditingExpense(exp);
    setShowForm(true);
    setFormError(null);
    setForm({
      expense_date: exp.expense_date,
      vehicle_id: exp.vehicle_id,
      category: exp.category,
      description: exp.description,
      amount: String(exp.amount),
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

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount > $0.00');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        expense_date: form.expense_date,
        vehicle_id: form.vehicle_id,
        category: form.category,
        description: form.description.trim(),
        amount,
        client_request_id: editingExpense ? undefined : requestId,
      };

      if (editingExpense) {
        await apiFetch(`/api/expenses/${editingExpense.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'success', text: t('expenseUpdatedMsg') });
      } else {
        await apiFetch('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'success', text: t('expenseSavedMsg') });
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
      await apiFetch(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' });
      setFeedback({ type: 'success', text: t('expenseDeletedMsg') });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('deleteExpenseTitle'),
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <ToastBanner message={feedback} onDismiss={() => setFeedback(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('expenseLedgerTitle')}</h2>
          <p className="text-sm text-slate-500">{t('expenseLedgerSub')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (editingExpense) resetForm();
            setShowForm((prev) => !prev);
          }}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{showForm ? t('hideExpenseForm') : t('recordExpenseBtn')}</span>
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              {editingExpense ? t('editExpenseTitle') : t('recordExpenseTitle')}
            </h3>
            {editingExpense && (
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('dateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.expense_date}
                    onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
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
                    onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.plate_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('categoryLabel')}
                  </label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))
                    }
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabel(cat)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('descriptionLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder={t('descriptionPlaceholder')}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t('amountUsdLabel')}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base focus:border-[#1D4E89] focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-end">
                {editingExpense && (
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
                    : editingExpense
                    ? t('updateExpenseBtn')
                    : t('saveExpenseBtn')}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <div className="relative sm:col-span-2 lg:min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchExpensePlaceholder')}
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

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as 'all' | ExpenseCategory)}
            aria-label={t('categoryLabel')}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-700 focus:border-[#1D4E89] focus:outline-none sm:text-sm"
          >
            <option value="all">{t('allCategories')}</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabel(cat)}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
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
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600 tabular-nums">
          <span>
            {t('recordsLabel')}: <strong className="font-mono text-slate-900">{expenses.length}</strong>
          </span>
          <span>
            {t('totalExpenses')}:{' '}
            <strong className="font-mono text-[#DC2626]">{formatUSD(totalAmount)}</strong>
          </span>
        </div>
      </div>

      {/* Table / Cards */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('loading')}</div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Receipt className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">{t('noExpensesFound')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('noExpensesSub')}</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {expenses.map((exp) => (
                <div key={exp.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-slate-500">{exp.expense_date}</div>
                      <div className="font-semibold text-slate-900">{exp.description}</div>
                      <div className="text-xs text-slate-500">
                        {exp.vehicle_name} (<span className="font-mono">{exp.plate_number}</span>)
                      </div>
                    </div>
                    <div className="font-mono text-base font-bold text-[#DC2626] tabular-nums">
                      {formatUSD(exp.amount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-xs font-medium text-slate-600">
                      {categoryLabel(exp.category)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(exp)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-[#1D4E89] hover:bg-slate-50"
                        aria-label={t('edit')}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(exp)}
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
                    <th className="px-4 py-3">{t('categoryLabel').replace(' *', '')}</th>
                    <th className="px-4 py-3">{t('descriptionLabel').replace(' *', '')}</th>
                    <th className="px-4 py-3 text-right">{t('amountUsdLabel').replace(' *', '')}</th>
                    <th className="px-5 py-3 text-right">{t('actionsCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-800 whitespace-nowrap">
                        {exp.expense_date}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{exp.vehicle_name}</div>
                        <div className="font-mono text-xs text-slate-500">{exp.plate_number}</div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {categoryLabel(exp.category)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{exp.description}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-[#DC2626] tabular-nums">
                        {formatUSD(exp.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(exp)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#1D4E89]"
                            title={t('edit')}
                            aria-label={t('edit')}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(exp)}
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
        title={t('deleteExpenseTitle')}
        description={`${deleteTarget ? categoryLabel(deleteTarget.category) : ''} (${formatUSD(
          deleteTarget?.amount ?? 0
        )}) — ${deleteTarget?.vehicle_name ?? ''} (${deleteTarget?.expense_date ?? ''})? ${t('deleteExpenseDesc')}`}
        confirmLabel={t('delete')}
        busy={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
