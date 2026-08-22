export const REFERRAL_COOKIE_KEY = 'dialectiva_ref';
export const DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export function normalizeReferralCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^[A-Za-z0-9_-]{4,64}$/.test(trimmed) ? trimmed : undefined;
}

export function readReferralCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const parts = document.cookie.split(';').map((part) => part.trim());
  const entry = parts.find((part) => part.startsWith(`${REFERRAL_COOKIE_KEY}=`));
  if (!entry) return undefined;
  const rawValue = entry.slice(`${REFERRAL_COOKIE_KEY}=`.length);
  try {
    return normalizeReferralCode(decodeURIComponent(rawValue));
  } catch {
    return normalizeReferralCode(rawValue);
  }
}

export function writeReferralCookie(code: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${REFERRAL_COOKIE_KEY}=${encodeURIComponent(code)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

export function clearReferralCookie(): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${REFERRAL_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}
