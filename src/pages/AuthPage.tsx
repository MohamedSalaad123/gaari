import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useLanguage } from '../i18n';
import { apiFetch, checkPasswordRules, setAuthToken } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthPageProps {
  needsSetup: boolean;
  dbConfigured?: boolean;
  dbConnected?: boolean;
  dbError?: string | null;
  onRetryConnection: () => void;
  onSetupCompleted: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthPage({
  needsSetup,
  dbConfigured = true,
  dbConnected = true,
  dbError = null,
  onRetryConnection,
  onSetupCompleted,
  onAuthenticated,
}: AuthPageProps) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupSuccessMsg, setSetupSuccessMsg] = useState<string | null>(null);

  const rules = checkPasswordRules(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSetupSuccessMsg(null);

    if (needsSetup) {
      if (!username.trim() || username.trim().length < 3) {
        setError(t('errUsernameMin3'));
        return;
      }
      if (!rules.minLength) {
        setError(t('errPasswordMin8'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('errPasswordMismatch'));
        return;
      }
    } else {
      if (!username.trim() || !password) {
        setError(t('errEnterUserPass'));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (needsSetup) {
        await apiFetch<{ setupComplete: boolean; username: string; message: string }>(
          '/api/auth/setup',
          {
            method: 'POST',
            body: JSON.stringify({
              username: username.trim(),
              fullName: fullName.trim() || 'Administrator',
              password,
              confirmPassword,
            }),
          }
        );

        // Redirect from first-time setup to Login view as required
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setSetupSuccessMsg(t('setupSuccessRedirect'));
        onSetupCompleted();
      } else {
        const result = await apiFetch<{
          authenticated: boolean;
          token: string;
          user: AuthUser;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password }),
        });

        if (result.token) {
          setAuthToken(result.token);
        }
        onAuthenticated(result.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errAuthFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0B162C] px-4 py-6 sm:py-10">
      {/* Top Language Switcher Bar */}
      <div className="mx-auto flex w-full max-w-md items-center justify-end">
        <LanguageSwitcher variant="dark" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-6">
        {/* Brand Header */}
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandLogo size={52} variant="light" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('brandName')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">{t('brandTagline')}</p>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8">
          {!dbConnected ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{t('dbUnavailableTitle')}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {dbConfigured ? t('dbConnErrorDesc') : t('dbNotConfiguredDesc')}
                  </p>
                </div>
              </div>

              {dbError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 font-mono text-xs text-red-800 break-words">
                  {dbError}
                </div>
              )}

              <button
                type="button"
                onClick={onRetryConnection}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1D4E89] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#163D6B]"
              >
                <RefreshCw className="h-4 w-4" />
                <span>{t('retry')}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">
                  {needsSetup ? t('authCreateAdminTitle') : t('authSignInTitle')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {needsSetup ? t('authCreateAdminDesc') : t('authSignInDesc')}
                </p>
              </div>

              {setupSuccessMsg && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{setupSuccessMsg}</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {needsSetup && (
                  <div>
                    <label
                      htmlFor="fullName"
                      className="block text-sm font-medium text-slate-700"
                    >
                      {t('fullNameLabel')}
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('fullNamePlaceholder')}
                      autoComplete="name"
                      className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/20 sm:text-sm"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                    {t('usernameLabel')}
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('usernamePlaceholder')}
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/20 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    {t('passwordLabel')}
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={needsSetup ? 'new-password' : 'current-password'}
                      required
                      className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-12 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/20 sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 flex min-h-[40px] min-w-[40px] -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {needsSetup && (
                  <>
                    <div>
                      <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-slate-700"
                      >
                        {t('confirmPasswordLabel')}
                      </label>
                      <div className="relative mt-1.5">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          required
                          className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-12 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none focus:ring-2 focus:ring-[#1D4E89]/20 sm:text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          className="absolute right-1.5 top-1/2 flex min-h-[40px] min-w-[40px] -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          aria-label={
                            showConfirmPassword ? t('hidePassword') : t('showPassword')
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
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
                          className={`h-3.5 w-3.5 shrink-0 ${
                            rules.minLength ? 'text-emerald-600' : 'text-slate-300'
                          }`}
                        />
                        <span>{t('passwordReqMin8')}</span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                        {t('passwordReqEasyNote')}
                      </p>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1D4E89] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#163D6B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>
                    {submitting
                      ? needsSetup
                        ? t('creatingAccount')
                        : t('signingIn')
                      : needsSetup
                      ? t('createAdminBtn')
                      : t('login')}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">{t('onlineMongoFooter')}</p>
      </div>
    </div>
  );
}
