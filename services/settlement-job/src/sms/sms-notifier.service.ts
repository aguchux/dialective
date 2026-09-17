import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AfricasTalkingProvider } from './providers/africastalking.provider';
import { Smslive247Provider } from './providers/smslive247.provider';
import { TermiiProvider } from './providers/termii.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { SmsFallbackChain } from './sms-fallback-chain';
import {
  parseSmsTransactionalProviderOrder,
  SmsProvider,
  SmsProviderKey,
} from './sms-provider.interface';

/**
 * Miniature standalone counterpart to services/api's SmsService --
 * settlement-job is a separate, non-HTTP deployable with no shared
 * NestJS module boundary with api (see settlement.service.ts's doc
 * comment), so this reads PlatformSettings directly via its own Prisma
 * client (same convention as getSettlementDelayMinutes et al.) rather than
 * injecting api's PlatformSettingsService. Only used for the referral
 * payout-bonus notification -- if this job ever needs more SMS-sending
 * surface, promote this to a real shared package instead of growing it
 * ad hoc here.
 */
@Injectable()
export class SmsNotifierService {
  private readonly logger = new Logger(SmsNotifierService.name);
  private readonly providersByKey: Record<SmsProviderKey, SmsProvider>;
  private readonly chain: SmsFallbackChain;

  constructor(private readonly prisma: PrismaService) {
    this.providersByKey = {
      termii: new TermiiProvider(),
      twilio: new TwilioProvider(),
      africastalking: new AfricasTalkingProvider(),
      smslive247: new Smslive247Provider(),
    };
    this.chain = new SmsFallbackChain(this.providersByKey);
  }

  /**
   * Best-effort SMS to the referrer credited a payout bonus off this
   * settlement -- gated by PlatformSettings.referralSmsPayoutBonusEnabled
   * plus the same phone-verified/opted-in checks WalletController's
   * notifySms uses, and never allowed to throw back into the settlement
   * loop (settleWordRecordings already logs-and-continues per row; a
   * notification failure must not count as that row's failure).
   */
  async notifyReferralPayoutBonus(referrerUserId: string, amount: string): Promise<void> {
    try {
      const settings = await this.prisma.platformSettings.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' },
      });
      if (!settings.referralSmsPayoutBonusEnabled) return;

      const user = await this.prisma.user.findUnique({
        where: { id: referrerUserId },
        select: { phoneNumber: true, phoneVerifiedAt: true, smsNotificationsEnabled: true },
      });
      if (!user?.phoneNumber || !user.phoneVerifiedAt || !user.smsNotificationsEnabled) return;

      const order = parseSmsTransactionalProviderOrder(settings.smsTransactionalProviderOrder);
      await this.chain.send(
        user.phoneNumber,
        `Dialect Library: You earned a ${amount} DL referral bonus from your referral's training payout.`,
        order,
        settings.smsSenderId ?? undefined,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send referral payout-bonus SMS for user=${referrerUserId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
