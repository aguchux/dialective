import { Injectable } from '@nestjs/common';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { AfricasTalkingProvider } from './providers/africastalking.provider';
import { Smslive247Provider } from './providers/smslive247.provider';
import { TermiiProvider } from './providers/termii.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { SmsFallbackChain } from './sms-fallback-chain';
import {
  parseSmsProviderOrder,
  parseSmsTransactionalProviderOrder,
  SmsProvider,
  SmsProviderKey,
} from './sms-provider.interface';

/**
 * Thin injectable wrapper around SmsFallbackChain, reading the
 * admin-configured provider order from PlatformSettings. Mirrors
 * LlmNormalizerService's constructor/provider-map pattern.
 */
@Injectable()
export class SmsService {
  private readonly providersByKey: Record<SmsProviderKey, SmsProvider>;
  private readonly chain: SmsFallbackChain;

  constructor(private readonly platformSettings: PlatformSettingsService) {
    this.providersByKey = {
      termii: new TermiiProvider(),
      twilio: new TwilioProvider(),
      africastalking: new AfricasTalkingProvider(),
      smslive247: new Smslive247Provider(),
    };
    this.chain = new SmsFallbackChain(this.providersByKey);
  }

  async sendOtp(toE164: string, code: string): Promise<void> {
    const settings = await this.platformSettings.getForAdmin();
    const useTransactionalRoute = settings.smsTransactionalOtpEnabled;
    const order = useTransactionalRoute
      ? parseSmsTransactionalProviderOrder(settings.smsTransactionalProviderOrder)
      : parseSmsProviderOrder(settings.smsProviderOrder);
    await this.chain.send(
      toE164,
      useTransactionalRoute
        ? code
        : `Your Dialect Library verification code is ${code}. It expires in 10 minutes.`,
      order,
      settings.smsSenderId ?? undefined,
    );
  }

  /** Plain transactional/notification SMS (e.g. P2P trade updates) -- not OTP, uses its own provider order (smsTransactionalProviderOrder), which includes smslive247. */
  /**
   * providerOverride forces a single provider with no fallback -- used by
   * the admin SMS screen's per-send provider selector, so an admin can
   * deliberately test/use one specific provider instead of the configured
   * fallback order. Omitted (the OTP/P2P call sites), it behaves exactly as
   * before: the full admin-configured smsTransactionalProviderOrder chain.
   */
  async sendTransactional(
    toE164: string,
    body: string,
    providerOverride?: SmsProviderKey,
  ): Promise<{ provider: SmsProviderKey }> {
    const settings = await this.platformSettings.getForAdmin();
    const order = providerOverride
      ? [providerOverride]
      : parseSmsTransactionalProviderOrder(settings.smsTransactionalProviderOrder);
    return this.chain.send(toE164, body, order, settings.smsSenderId ?? undefined);
  }
}
