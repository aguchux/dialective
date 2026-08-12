export type SmsProviderKey = 'termii' | 'twilio' | 'africastalking' | 'smslive247';

export const ALL_SMS_PROVIDER_KEYS: SmsProviderKey[] = ['termii', 'twilio', 'africastalking', 'smslive247'];

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
  send(toE164: string, body: string): Promise<void>;
}

const DEFAULT_PROVIDER_ORDER: SmsProviderKey[] = ['termii', 'twilio', 'africastalking', 'smslive247'];

/** Parses a CSV provider-order string, falling back to the default order if it isn't a valid permutation. */
export function parseSmsProviderOrder(csv: string): SmsProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as SmsProviderKey[];
  const isValidPermutation =
    parts.length === ALL_SMS_PROVIDER_KEYS.length &&
    ALL_SMS_PROVIDER_KEYS.every((key) => parts.includes(key)) &&
    new Set(parts).size === ALL_SMS_PROVIDER_KEYS.length;
  return isValidPermutation ? parts : DEFAULT_PROVIDER_ORDER;
}
