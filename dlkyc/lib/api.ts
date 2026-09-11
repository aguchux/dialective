const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.dialectlibrary.com';

export class KycApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new KycApiError(json.message ?? 'Something went wrong. Please try again.');
  }
  return json as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new KycApiError(json.message ?? 'Something went wrong. Please try again.');
  }
  return json as T;
}

export interface ResumeSessionResult {
  verificationId: string;
  callbackUrl: string;
  documentTypes: string[];
}

export function resumeSession(token: string) {
  return post<ResumeSessionResult>('/kyc/self/resume', { token });
}

export function getChallenge() {
  return get<{ challenge: string }>('/kyc/self/challenge');
}

export function createDocumentUploadUrl(verificationId: string, token: string, contentType: string) {
  return post<{ uploadUrl: string; key: string }>(
    `/kyc/self/verifications/${verificationId}/document-upload-url`,
    { token, contentType },
  );
}

export function createSelfieUploadUrl(verificationId: string, token: string, contentType: string) {
  return post<{ uploadUrl: string; key: string }>(
    `/kyc/self/verifications/${verificationId}/selfie-upload-url`,
    { token, contentType },
  );
}

export async function uploadToSignedUrl(uploadUrl: string, blob: Blob, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new KycApiError('Upload failed. Please try again.');
  }
}

export function submitDocument(
  verificationId: string,
  token: string,
  body: { documentType: string; frontKey: string; backKey?: string },
) {
  return post<{ ok: true }>(`/kyc/self/verifications/${verificationId}/document`, {
    token,
    ...body,
  });
}

export function submitSelfie(
  verificationId: string,
  token: string,
  body: { frameKeys: string[]; challenge: string },
) {
  return post<{ ok: true }>(`/kyc/self/verifications/${verificationId}/selfie`, {
    token,
    ...body,
  });
}

export interface KycStatusResult {
  kycStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'APPROVED' | 'DECLINED' | 'ABANDONED' | 'EXPIRED';
  kycVerifiedAt: string | null;
}

export function submitForDecision(verificationId: string, token: string) {
  return post<KycStatusResult>(`/kyc/self/verifications/${verificationId}/submit`, { token });
}
