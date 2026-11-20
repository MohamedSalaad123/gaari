import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../i18n';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useLanguage();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#1D4E89]'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {cancelLabel ?? t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
              tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#1D4E89] hover:bg-[#163D6B]'
            }`}
          >
            {busy ? t('processing') : (confirmLabel ?? t('confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
