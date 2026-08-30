export const REFERRAL_COOKIE_KEY = 'dialectiva_ref';
export const MARKETING_CAMPAIGN_COOKIE_KEY = 'dialectiva_campaign';
export const DEFAULT_REFERRAL_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export function normalizeReferralCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^[A-Za-z0-9_-]{4,64}$/.test(trimmed) ? trimmed : undefined;
}

export function normalizeMarketingCampaignId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : undefined;
}

function readCookie(key: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const parts = document.cookie.split(';').map((part) => part.trim());
  const entry = parts.find((part) => part.startsWith(`${key}=`));
  if (!entry) return undefined;
  const rawValue = entry.slice(`${key}=`.length);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

function writeCookie(key: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function clearCookie(key: string): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export function readReferralCookie(): string | undefined {
  return normalizeReferralCode(readCookie(REFERRAL_COOKIE_KEY));
}

export function writeReferralCookie(code: string, maxAgeSeconds: number): void {
  writeCookie(REFERRAL_COOKIE_KEY, code, maxAgeSeconds);
}

export function clearReferralCookie(): void {
  clearCookie(REFERRAL_COOKIE_KEY);
}

export function readMarketingCampaignCookie(): string | undefined {
  return normalizeMarketingCampaignId(readCookie(MARKETING_CAMPAIGN_COOKIE_KEY));
}

export function writeMarketingCampaignCookie(shareId: string, maxAgeSeconds: number): void {
  writeCookie(MARKETING_CAMPAIGN_COOKIE_KEY, shareId, maxAgeSeconds);
}

export function clearMarketingCampaignCookie(): void {
  clearCookie(MARKETING_CAMPAIGN_COOKIE_KEY);
}
