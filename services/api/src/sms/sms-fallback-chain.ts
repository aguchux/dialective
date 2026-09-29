import { Logger } from '@nestjs/common';
import { SmsDeliveryException } from './sms-delivery.exception';
import { SmsProvider, SmsProviderKey } from './sms-provider.interface';

/**
 * Tries providers strictly in order -- first success wins, later providers
 * in the order are never invoked. Only throws (a combined error listing
 * every failure) if every provider in the order fails. Mirrors
 * services/api/src/llm/llm-fallback-chain.ts, adapted for send().
 */
export class SmsFallbackChain {
  private readonly logger = new Logger(SmsFallbackChain.name);

  constructor(private readonly providersByKey: Record<SmsProviderKey, SmsProvider>) {}

  async send(
    toE164: string,
    body: string,
    order: SmsProviderKey[],
    senderIdOverride?: string,
  ): Promise<{ provider: SmsProviderKey }> {
    const failures: string[] = [];
    const destination = toStrictE164(toE164);

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        await provider.send(destination, body, senderIdOverride);
        return { provider: key };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provider "${key}" failed: ${message}`);
        failures.push(`${key}: ${message}`);
      }
    }

    this.logger.error(`All SMS providers failed -- ${failures.join('; ')}`);
    throw new SmsDeliveryException();
  }
}

/**
 * Strips spaces, hyphens, brackets and dots from a destination number.
 *
 * `User.phoneNumber` is only ever *validated* (libphonenumber's
 * `isValidPhoneNumber`, in AuthService) and never normalised, so whatever
 * punctuation the member typed is stored and handed to a provider verbatim.
 * SMSLive247 reads the spaces in "+27 82 123 4567" as a delimiter and
 * rejects the send with "Only one phone number should be included"; the
 * others vary in what they tolerate. Normalising in the chain rather than
 * in each provider means one rule covers all four, and a provider still
 * receives the leading "+" it expects (each strips that itself if needed).
 *
 * Digits are never added, removed or reordered -- a number that was not
 * dialable before is not made dialable here.
 */
function toStrictE164(input: string): string {
  return input.replace(/[\s()\-.]/g, '');
}
