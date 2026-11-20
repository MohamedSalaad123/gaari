const TOKEN_STORAGE_KEY = 'haulledger_jwt_token';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

let unauthorizedListener: (() => void) | null = null;

export function setUnauthorizedListener(listener: (() => void) | null): void {
  unauthorizedListener = listener;
}

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(url), {
    ...options,
    headers,
    credentials: 'include',
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    if (
      response.status === 401 &&
      code !== 'INVALID_CREDENTIALS' &&
      !url.includes('/api/auth/login') &&
      !url.includes('/api/auth/change-password')
    ) {
      clearAuthToken();
      unauthorizedListener?.();
    }

    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, code);
  }

  return payload as T;
}

export async function apiDownload(
  url: string,
  fallbackFileName: string,
  options: { method?: 'GET' | 'POST' } = {}
): Promise<{ fileName: string; totalRecords: number | null; checksum: string | null }> {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(url), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await response.json() : null;
    if (response.status === 401) {
      clearAuthToken();
      unauthorizedListener?.();
    }
    throw new ApiError(payload?.error || `Download failed (${response.status})`, response.status);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const fileName = match?.[1] || fallbackFileName;

  const totalHeader = response.headers.get('x-backup-total-records');
  const totalRecords = totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : null;
  const checksum = response.headers.get('x-backup-checksum');

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

  return { fileName, totalRecords, checksum };
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function getTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthStartDate(): string {
  return `${getTodayDate().slice(0, 7)}-01`;
}

export function checkPasswordRules(password: string) {
  return {
    minLength: password.length >= 8,
    hasLettersOrNumbers: /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~\s]+$/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
}
