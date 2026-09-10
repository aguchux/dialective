const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.dialectlibrary.com';

export type SubscriberOrgRole =
  | 'OWNER'
  | 'ADMIN'
  | 'DATASET_MANAGER'
  | 'VALIDATOR'
  | 'API_DEVELOPER'
  | 'BILLING_MANAGER'
  | 'AUDITOR';

export interface SubscriberPublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SubscriberAuthResult {
  accessToken: string;
  refreshToken: string;
  user: SubscriberPublicUser;
  organizationId: string;
  orgRole: SubscriberOrgRole;
}

export interface SubscriberAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SubscriberPendingOtp {
  otpRequired: true;
  ticket: string;
  expiresInSeconds: number;
}

export class ApiError extends Error {
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
  // register() only succeeds while the backend has
  // PlatformSettings.streamSelfServeSignupEnabled on -- see
  // app/register/page.tsx, which checks getPublicSettings() first and shows
  // the lead-capture "Request access" form instead when it's off.
  register: (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) =>
    apiFetch<SubscriberPendingOtp>('/voice-stream/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getPublicSettings: () =>
    apiFetch<{ selfServeSignupEnabled: boolean }>('/voice-stream/settings/public', {
      method: 'GET',
    }),

  login: (email: string, password: string) =>
    apiFetch<SubscriberPendingOtp>('/voice-stream/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  verifyOtp: (ticket: string, code: string) =>
    apiFetch<SubscriberAuthResult>('/voice-stream/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ ticket, code }),
    }),

  resendOtp: (ticket: string) =>
    apiFetch<void>('/voice-stream/auth/otp/resend', {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    }),

  refresh: (refreshToken: string) =>
    apiFetch<SubscriberAuthTokens>('/voice-stream/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken: string) =>
    apiFetch<void>('/voice-stream/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  acceptInvite: (token: string, password: string) =>
    apiFetch<SubscriberAuthResult>('/voice-stream/auth/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  requestPasswordReset: (email: string) =>
    apiFetch<void>('/voice-stream/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<void>('/voice-stream/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
};
