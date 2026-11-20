import { Check, Database, Download, Eye, EyeOff, KeyRound, ShieldCheck, Upload } from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { FeedbackMessage } from '../components/ToastBanner';
import { ToastBanner } from '../components/ToastBanner';
import { useLanguage } from '../i18n';
import { apiDownload, apiFetch, checkPasswordRules, setAuthToken } from '../lib/api';
import type { BackupInfo } from '../types';

export function SettingsPage() {
  const { t, lang } = useLanguage();
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  // Backup & Restore State
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rules = checkPasswordRules(newPassword);
  const isPasswordValid = rules.minLength && rules.hasLettersOrNumbers;

  const loadBackupInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const info = await apiFetch<BackupInfo>('/api/backup/info');
      setBackupInfo(info);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
    } finally {
      setLoadingInfo(false);
    }
  }, [t]);

  useEffect(() => {
    void loadBackupInfo();
  }, [loadBackupInfo]);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isPasswordValid) {
      setFeedback({
        type: 'error',
        text: t('errPasswordMin8'),
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: t('errPasswordMismatch') });
      return;
    }

    setChangingPw(true);
    try {
      const res = await apiFetch<{ success: boolean; token?: string; message?: string }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        }
      );
      if (res.token) {
        setAuthToken(res.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'success', text: t('passwordUpdatedMsg') });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
    } finally {
      setChangingPw(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setFeedback(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await apiDownload(
        '/api/backup/dump',
        `haulledger_backup_${today}.json`,
        { method: 'POST' }
      );
      const countSuffix =
        result.totalRecords !== null
          ? ` · ${result.totalRecords} ${t('recordsLabel').toLowerCase()}`
          : '';
      setFeedback({
        type: 'success',
        text: `${t('backupDownloadedMsg')} (${result.fileName}${countSuffix}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) {
      setConfirmRestoreOpen(true);
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedFile) return;
    setRestoring(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('database', selectedFile);

      await apiFetch('/api/backup/restore', {
        method: 'POST',
        body: formData,
      });

      setFeedback({
        type: 'success',
        text: t('restoreSuccessMsg'),
      });
      setConfirmRestoreOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadBackupInfo();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('errAuthFailed'),
      });
      setConfirmRestoreOpen(false);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastBanner message={feedback} onDismiss={() => setFeedback(null)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Administrator Password Security */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <KeyRound className="h-5 w-5 shrink-0 text-[#1D4E89]" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">{t('changePasswordTitle')}</h2>
              <p className="text-xs text-slate-500">{t('changePasswordSub')}</p>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                {t('currentPasswordLabel')}
              </label>
              <div className="relative mt-1">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-11 text-sm focus:border-[#1D4E89] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((p) => !p)}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700"
                  aria-label={showCurrent ? t('hidePassword') : t('showPassword')}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                {t('newPasswordLabel')}
              </label>
              <div className="relative mt-1">
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-11 text-sm focus:border-[#1D4E89] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((p) => !p)}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700"
                  aria-label={showNew ? t('hidePassword') : t('showPassword')}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                {t('confirmNewPasswordLabel')}
              </label>
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4E89] focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ShieldCheck className="h-4 w-4 text-[#1D4E89]" />
                <span>{t('passwordReqTitle')}</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs ${
                  rules.minLength ? 'font-medium text-emerald-700' : 'text-slate-600'
                }`}
              >
                <Check
                  className={`h-3.5 w-3.5 ${rules.minLength ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                <span>{t('passwordReqMin8')}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {t('passwordReqEasyNote')}
              </p>
            </div>

            <button
              type="submit"
              disabled={changingPw}
              className="min-h-[44px] w-full rounded-lg bg-[#1D4E89] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#163D6B] disabled:opacity-60 sm:w-auto"
            >
              {changingPw ? t('updatingPassword') : t('updatePasswordBtn')}
            </button>
          </form>
        </section>

        {/* MongoDB Atlas Backup & Restore */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <Database className="h-5 w-5 shrink-0 text-[#1D4E89]" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">{t('dbBackupTitle')}</h2>
              <p className="text-xs text-slate-500">{t('dbBackupSub')}</p>
            </div>
          </div>

          {loadingInfo ? (
            <div className="py-8 text-center text-sm text-slate-500">{t('loading')}</div>
          ) : backupInfo ? (
            <div className="mt-5 space-y-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">{t('dbProviderLabel')}</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {backupInfo.provider}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">{t('dbNameLabel')}</span>
                  <span className="font-mono text-slate-800">{backupInfo.dbName}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">{t('dbStatusLabel')}</span>
                  <span
                    className={`font-medium ${
                      backupInfo.connected ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {backupInfo.connected ? t('dbConnectedText') : t('dbDisconnectedText')}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs text-slate-600 sm:grid-cols-3">
                  <div>
                    {t('nav_vehicles')}:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {backupInfo.counts.vehicles}
                    </strong>
                  </div>
                  <div>
                    {t('nav_daily_work')}:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {backupInfo.counts.dailyWorks}
                    </strong>
                  </div>
                  <div>
                    {t('nav_expenses')}:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {backupInfo.counts.expenses}
                    </strong>
                  </div>
                  <div>
                    {t('tabWorkingDaysLog')}:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {backupInfo.counts.rentalObligations}
                    </strong>
                  </div>
                  <div>
                    {t('tabPaymentHistory')}:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {backupInfo.counts.rentalPayments}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">{t('downloadBackupTitle')}</h3>
                <p className="text-xs leading-relaxed text-slate-600">{t('downloadBackupSub')}</p>
                <button
                  type="button"
                  disabled={downloadingBackup}
                  onClick={() => void handleDownloadBackup()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#1D4E89] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#163D6B] disabled:opacity-60 sm:w-auto"
                >
                  <Download className="h-4 w-4" />
                  <span>
                    {downloadingBackup
                      ? lang === 'so'
                        ? 'Waa la soo dejinayaa...'
                        : 'Downloading...'
                      : t('downloadBackupBtn')}
                  </span>
                </button>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">{t('restoreBackupTitle')}</h3>
                <p className="text-xs leading-relaxed text-slate-600">{t('restoreBackupSub')}</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                  id="restore-db-input"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  <span>{t('selectBackupBtn')}</span>
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={confirmRestoreOpen}
        title={t('restoreDialogTitle')}
        description={`${t('restoreDialogDesc')} (${selectedFile?.name ?? ''})`}
        confirmLabel={t('restoreConfirmBtn')}
        cancelLabel={t('cancel')}
        tone="primary"
        busy={restoring}
        onConfirm={() => void handleConfirmRestore()}
        onCancel={() => {
          setConfirmRestoreOpen(false);
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
}
