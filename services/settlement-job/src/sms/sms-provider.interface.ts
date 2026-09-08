// Kept in sync by hand with services/api/src/sms/sms-provider.interface.ts --
// settlement-job is a separate, non-HTTP deployable with no shared NestJS
// module boundary with api (see settlement.service.ts's doc comment), so
// this SMS-sending capability is duplicated here in miniature rather than
// imported. Only what this job actually needs (a single transactional send
// with fallback, no OTP shapes) is ported over.

export type SmsProviderKey = 'termii' | 'twilio' | 'africastalking' | 'smslive247';

export interface SmsProvider {
  readonly key: SmsProviderKey;
  send(toE164: string, body: string, senderIdOverride?: string): Promise<void>;
}

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
