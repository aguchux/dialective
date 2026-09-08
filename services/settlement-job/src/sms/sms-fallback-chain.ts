// Ported from services/api/src/sms/sms-fallback-chain.ts -- keep in sync by hand.
import { Logger } from '@nestjs/common';
import { SmsProvider, SmsProviderKey } from './sms-provider.interface';

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

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        await provider.send(toE164, body, senderIdOverride);
        return { provider: key };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provider "${key}" failed: ${message}`);
        failures.push(`${key}: ${message}`);
      }
    }

    this.logger.error(`All SMS providers failed -- ${failures.join('; ')}`);
    throw new Error('All SMS providers failed');
  }
}
