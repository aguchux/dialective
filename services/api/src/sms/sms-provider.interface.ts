export type SmsProviderKey = 'termii' | 'twilio' | 'africastalking' | 'smslive247';

export const ALL_SMS_PROVIDER_KEYS: SmsProviderKey[] = [
  'termii',
  'twilio',
  'africastalking',
  'smslive247',
];

/**
 * Fallback-chain-eligible providers for the fire-and-forget "send this
 * exact code" OTP contract (smsProviderOrder). smslive247 is deliberately
 * excluded: their OTP-compliant route generates its own code and verifies
 * it on their side (see smslive247-native-otp.ts) -- it can't fire-and-
 * forget an arbitrary code the way Termii/Twilio/Africa's Talking can, and
 * their generic /api/v5/sms route rejects messages containing OTP-shaped
 * numbers outright. smslive247 stays a valid SmsProvider (for potential
 * future non-OTP notification use) but is never a smsProviderOrder member.
 */
export const SMS_OTP_FALLBACK_PROVIDER_KEYS: SmsProviderKey[] = [
  'termii',
  'twilio',
  'africastalking',
];

/**
 * A single provider sends one SMS to one E.164 number. Each implementation
 * throws on any network error, non-2xx, or missing credentials so
 * SmsFallbackChain can treat "provider failed" uniformly via try/catch and
 * move to the next provider in the configured order -- an unconfigured
 * provider (no API key set) just "fails" like any other, so a partial
 * credential rollout works with zero code changes.
 */
export interface SmsProvider {
  readonly key: SmsProviderKey;
  /** senderIdOverride is the admin-configured PlatformSettings.smsSenderId -- providers fall back to their own env var when it's undefined. Twilio ignores it (sends from a purchased phone number, not a named sender ID). */
  send(toE164: string, body: string, senderIdOverride?: string): Promise<void>;
}

const DEFAULT_PROVIDER_ORDER: SmsProviderKey[] = SMS_OTP_FALLBACK_PROVIDER_KEYS;

/** Parses a CSV provider-order string, falling back to the default order if it isn't a valid permutation of the OTP-eligible providers. */
export function parseSmsProviderOrder(csv: string): SmsProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as SmsProviderKey[];
  const isValidPermutation =
    parts.length === SMS_OTP_FALLBACK_PROVIDER_KEYS.length &&
    SMS_OTP_FALLBACK_PROVIDER_KEYS.every((key) => parts.includes(key)) &&
    new Set(parts).size === SMS_OTP_FALLBACK_PROVIDER_KEYS.length;
  return isValidPermutation ? parts : DEFAULT_PROVIDER_ORDER;
}

/**
 * Fallback-chain-eligible providers for plain transactional/notification
 * SMS, including direct-code OTP when transactional OTP is enabled. This
 * chain includes SMSLive247 and is separately configurable from the legacy
 * explanatory OTP route.
 */
export const SMS_TRANSACTIONAL_PROVIDER_KEYS: SmsProviderKey[] = [
  'smslive247',
  'termii',
  'twilio',
  'africastalking',
];

const DEFAULT_TRANSACTIONAL_PROVIDER_ORDER: SmsProviderKey[] = SMS_TRANSACTIONAL_PROVIDER_KEYS;

/** Parses a CSV provider-order string for transactional SMS, falling back to the default order if it isn't a valid permutation of all 4 providers. */
export function parseSmsTransactionalProviderOrder(csv: string): SmsProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as SmsProviderKey[];
  const isValidPermutation =
    parts.length === SMS_TRANSACTIONAL_PROVIDER_KEYS.length &&
    SMS_TRANSACTIONAL_PROVIDER_KEYS.every((key) => parts.includes(key)) &&
    new Set(parts).size === SMS_TRANSACTIONAL_PROVIDER_KEYS.length;
  return isValidPermutation ? parts : DEFAULT_TRANSACTIONAL_PROVIDER_ORDER;
}
