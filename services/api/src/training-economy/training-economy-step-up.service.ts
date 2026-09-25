import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { resolveOtpDestination } from '../otp/otp.util';
import { adminActionContextHash } from '../wallet/otp-context.util';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/**
 * The step-up guarding the training-economy switch.
 *
 * It lives in its own module rather than inside SettingsModule for a
 * structural reason: SettingsModule is @Global and sits near the root of the
 * graph, while OtpModule depends on MailModule and SmsModule, both of which
 * import SettingsModule. Importing OtpModule into SettingsModule therefore
 * closes a cycle -- Settings -> Otp -> Mail -> Settings -- which Nest
 * resolves to `undefined` at scan time and which crash-loops the whole API
 * on boot. Unit tests construct the controller directly and never build the
 * module graph, so they cannot catch it; only starting the app does.
 *
 * Keeping the OTP dependency in a leaf module preserves the one-way flow
 * into SettingsModule that the @Global comment is relying on.
 */
@Injectable()
export class TrainingEconomyStepUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Issue a code for a specific direction.
   *
   * The direction is bound into the context hash, so a code issued to stop
   * payouts cannot be replayed to resume them.
   */
  async requestOtp(adminUserId: string, enabling: boolean) {
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const { destination, channel } = await resolveOtpDestination(admin, this.settings);
    return this.otp.issueForUser(
      adminUserId,
      OtpPurpose.TRAINING_ECONOMY_TOGGLE,
      destination,
      adminActionContextHash({
        action: 'training-economy-toggle',
        direction: enabling ? 'enable' : 'disable',
      }),
      channel,
    );
  }

  /**
   * Apply the switch, verifying the step-up first.
   *
   * Verified only when the value actually CHANGES. A request that resends
   * the current value is a no-op, and demanding a code for it would train
   * admins to treat the prompt as noise.
   */
  async apply(
    adminUserId: string,
    dto: { enabled: boolean; otpRequestId?: string; code?: string },
  ) {
    const current = await this.settings.isTrainingEconomyEnabled();
    if (dto.enabled === current) {
      return this.settings.getForAdmin();
    }
    await this.verifyStepUp(adminUserId, dto.enabled, dto.otpRequestId, dto.code);
    return this.settings.update({ trainingEconomyEnabled: dto.enabled });
  }

  /**
   * Gated on the same platform setting as every other admin step-up, so an
   * admin who turns admin OTP off is not locked out by a code they can no
   * longer receive.
   */
  async verifyStepUp(
    adminUserId: string,
    enabling: boolean,
    otpRequestId?: string,
    code?: string,
  ): Promise<void> {
    if (!(await this.settings.isAdminPayoutOtpEnabled())) {
      return;
    }
    if (!otpRequestId || !code) {
      throw new UnprocessableEntityException(
        `OTP verification is required to ${enabling ? 'resume' : 'stop'} training payouts`,
      );
    }
    await this.otp.verify({
      otpRequestId,
      userId: adminUserId,
      purpose: OtpPurpose.TRAINING_ECONOMY_TOGGLE,
      code,
      contextHash: adminActionContextHash({
        action: 'training-economy-toggle',
        direction: enabling ? 'enable' : 'disable',
      }),
    });
  }
}
