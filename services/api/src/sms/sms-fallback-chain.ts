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

  async send(toE164: string, body: string, order: SmsProviderKey[]): Promise<{ provider: SmsProviderKey }> {
    const failures: string[] = [];

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        await provider.send(toE164, body);
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
