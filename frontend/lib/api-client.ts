const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.nmseprep.com';

export interface PublicUser {
  id: string;
  email: string;
  role: 'TRAINER' | 'ADMIN';
  emailVerified: boolean;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request to api failed');
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  login: (email: string, password: string) =>
    apiFetch<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (email: string, password: string) =>
    apiFetch<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),

  refresh: (refreshToken: string) =>
    apiFetch<AuthTokens>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  requestMagicLink: (email: string) =>
    apiFetch<void>('/auth/magic-link/request', { method: 'POST', body: JSON.stringify({ email }) }),

  consumeMagicLink: (token: string) =>
    apiFetch<AuthResult>('/auth/magic-link/callback', {
      method: 'POST',
      headers: { 'x-oauth-callback-secret': requireOAuthCallbackSecret() },
      body: JSON.stringify({ token }),
    }),

  requestPasswordReset: (email: string) =>
    apiFetch<void>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<void>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  verifyEmail: (token: string) =>
    apiFetch<void>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
};

function requireOAuthCallbackSecret(): string {
  const secret = process.env.OAUTH_CALLBACK_SECRET;
  if (!secret) {
    throw new Error('OAUTH_CALLBACK_SECRET is not set');
  }
  return secret;
}
