import { Bell, CheckCheck, CreditCard, Wrench, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { apiFetch, formatUSD, getAuthToken, resolveApiUrl } from '../lib/api';
import type { AppNotification, NavSection } from '../types';

interface NotificationCenterProps {
  onNavigate: (section: NavSection) => void;
}

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const { t, lang, paymentMethodLabel } = useLanguage();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [liveAlert, setLiveAlert] = useState<AppNotification | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const alertTimerRef = useRef<number | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{
        notifications: AppNotification[];
        unreadCount: number;
      }>('/api/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore transient fetch failures; stream or next action will refresh
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // Real-time Server-Sent Events subscription
  useEffect(() => {
    const token = getAuthToken();
    const streamUrl = resolveApiUrl(
      token ? `/api/notifications/stream?token=${encodeURIComponent(token)}` : '/api/notifications/stream'
    );

    const es = new EventSource(streamUrl, { withCredentials: true });

    es.addEventListener('notification', (event) => {
      try {
        const incoming = JSON.parse((event as MessageEvent).data) as AppNotification;
        setNotifications((prev) => {
          if (prev.some((item) => item.id === incoming.id)) {
            return prev;
          }
          setUnreadCount((c) => c + (incoming.read ? 0 : 1));
          return [incoming, ...prev].slice(0, 30);
        });

        setLiveAlert(incoming);
        if (alertTimerRef.current !== null) {
          window.clearTimeout(alertTimerRef.current);
        }
        alertTimerRef.current = window.setTimeout(() => {
          setLiveAlert((current) => (current?.id === incoming.id ? null : current));
        }, 6500);
      } catch {
        // Ignore malformed SSE payload
      }
    });

    return () => {
      es.close();
      if (alertTimerRef.current !== null) {
        window.clearTimeout(alertTimerRef.current);
      }
    };
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleMarkOneRead = async (notif: AppNotification) => {
    if (!notif.read) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === notif.id ? { ...item, read: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await apiFetch<{ unreadCount: number }>(
          `/api/notifications/${notif.id}/read`,
          { method: 'PATCH' }
        );
        setUnreadCount(res.unreadCount);
      } catch {
        // Ignore; keep optimistic state
      }
    }

    setOpen(false);
    setLiveAlert(null);
    onNavigate(notif.type === 'vehicle_maintenance' ? 'vehicles' : 'rental-payments');
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      void fetchNotifications();
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'so' ? 'so-SO' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 16).replace('T', ' ');
    }
  };

  const describeNotification = (n: AppNotification) => {
    if (n.type === 'vehicle_maintenance') {
      return {
        title: t('notifMaintTitle'),
        body: `${n.vehicle_name} (${n.plate_number}) ${t('notifMaintBody')}`,
      };
    }
    const amtText = formatUSD(n.amount ?? 0);
    const methodText = n.payment_method ? ` · ${paymentMethodLabel(n.payment_method)}` : '';
    return {
      title: t('notifRentalTitle'),
      body: `${n.vehicle_name} (${n.plate_number}) ${t('notifRentalBodyPrefix')} ${amtText}${methodText}.`,
    };
  };

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="relative flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
          aria-label={`${t('notifTitle')} (${unreadCount} ${t('notifUnreadLabel')})`}
          aria-expanded={open}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#DC2626] px-1 font-mono text-[10px] font-bold text-white tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div
            role="region"
            aria-label={t('notifTitle')}
            className="fixed left-3 right-3 top-16 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{t('notifTitle')}</span>
                {unreadCount > 0 && (
                  <span className="font-mono text-xs font-medium text-[#1D4E89] tabular-nums">
                    ({unreadCount})
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="inline-flex min-h-[32px] items-center gap-1 text-xs font-medium text-[#1D4E89] hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>{t('notifMarkAllRead')}</span>
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Bell className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">{t('notifEmpty')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('notifEmptySub')}</p>
              </div>
            ) : (
              <div className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto">
                {notifications.map((n) => {
                  const { title, body } = describeNotification(n);
                  const isMaint = n.type === 'vehicle_maintenance';
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleMarkOneRead(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        n.read ? 'bg-white' : 'bg-blue-50/40'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isMaint ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-[#16A34A]'
                        }`}
                      >
                        {isMaint ? (
                          <Wrench className="h-4 w-4" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-xs ${
                              n.read ? 'font-medium text-slate-800' : 'font-semibold text-slate-900'
                            }`}
                          >
                            {title}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">
                            {formatTimestamp(n.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{body}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Floating In-App Alert Banner */}
      {liveAlert && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed left-3 right-3 top-16 z-50 sm:left-auto sm:right-6 sm:top-20 sm:w-96"
        >
          {(() => {
            const { title, body } = describeNotification(liveAlert);
            const isMaint = liveAlert.type === 'vehicle_maintenance';
            return (
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isMaint ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-[#16A34A]'
                  }`}
                >
                  {isMaint ? <Wrench className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                </div>
                <button
                  type="button"
                  onClick={() => void handleMarkOneRead(liveAlert)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="text-xs font-semibold text-slate-900">{title}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{body}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLiveAlert(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
