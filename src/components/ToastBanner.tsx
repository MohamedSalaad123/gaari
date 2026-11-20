import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useLanguage } from '../i18n';

export interface FeedbackMessage {
  type: 'success' | 'error';
  text: string;
}

interface ToastBannerProps {
  message: FeedbackMessage | null;
  onDismiss: () => void;
}

export function ToastBanner({ message, onDismiss }: ToastBannerProps) {
  const { t } = useLanguage();
  if (!message) return null;

  const isSuccess = message.type === 'success';

  return (
    <div
      role="status"
      className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        isSuccess
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-red-200 bg-red-50 text-red-900'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
        )}
        <span className="font-medium">{message.text}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
        aria-label={t('close')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
