import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { OtpPurpose } from '@dialectiva/db';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';

interface DataAccessLeadNotification {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  website: string | null;
  countriesInterested: string | null;
}

interface SupportRequestNotification {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface ReferralJoinNotification {
  inviterEmail: string;
  inviteeEmail: string;
  inviteeName: string;
}

interface ReferralInviteEmail {
  inviterName: string;
  inviterEmail: string;
  inviteeFirstName: string;
  inviteeEmail: string;
  referralUrl: string;
}

interface TrainingPayoutCreditedNotification {
  trainerEmail: string;
  tokenAmount: string;
  reference: string | null;
}

interface CourseCompletedNotification {
  trainerEmail: string;
  courseTitle: string;
  rewardTokens: string | null; // null when the course carries no completion reward
}

interface AuditHoldNotification {
  trainerEmail: string;
  submissionCount: number;
}

interface KycDeclinedNotification {
  trainerEmail: string;
  reason: string;
}

interface AnomalyAlertNotification {
  recipientEmail: string;
  organizationName: string;
  ruleKey: string;
  windowStart: Date;
  windowEnd: Date;
  details: Record<string, unknown>;
}

/**
 * Minimal, mail-service-local shape of a TrainerReport (see
 * wallet/trainer-report.service.ts) -- declared here rather than imported
 * from wallet/ to avoid a module cycle, since WalletModule already imports
 * MailModule. weekly-trainer-report.ts maps the real TrainerReport into this
 * shape at the call site.
 */
interface WeeklyTrainerReportEmail {
  trainerEmail: string;
  trainerFirstName: string | null;
  recordings: number;
  avgScore: string | null;
  totalEarningsTokens: string;
  daily: { date: string; recordings: number }[];
}

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
}

function streamFrontendUrl(): string {
  return process.env.STREAM_FRONTEND_URL ?? 'https://stream.dialectlibrary.com';
}

/**
 * Every auth flow that needs to email a user (password reset, email
 * verification, magic-link) calls through here, so the provider is a
 * one-file concern. Uses Resend (AGENTS.md "Authentication" /
 * "Email (Resend)") -- if RESEND_API_KEY isn't set (e.g. local dev without
 * a key), falls back to logging the link instead of failing outright, so
 * the rest of the auth flow stays testable without a Resend account.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged instead of sent');
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = `${frontendUrl()}/reset-password?token=${token}`;
    await this.send(
      email,
      'Reset your Dialect Library password',
      passwordResetHtml(url),
      `Reset your password: ${url}`,
      { kind: 'sendPasswordResetEmail' },
    );
  }

  async sendEmailVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${frontendUrl()}/verify-email?token=${token}`;
    await this.send(
      email,
      'Verify your Dialect Library email',
      verifyEmailHtml(url),
      `Verify your email: ${url}`,
      { kind: 'sendEmailVerificationEmail' },
    );
  }

  async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    // Points at a frontend page (not api directly) -- consuming the token
    // is a server-to-server call guarded by OAUTH_CALLBACK_SECRET, so a
    // browser can't call api's /auth/magic-link/callback on its own. The
    // frontend page exchanges the token via its own server-side route and
    // then establishes the NextAuth session. See AGENTS.md "Authentication".
    const url = `${frontendUrl()}/magic-link?token=${token}`;
    await this.send(
      email,
      'Your Dialect Library sign-in link',
      magicLinkHtml(url),
      `Sign in: ${url}`,
      { kind: 'sendMagicLinkEmail' },
    );
  }

  async sendSubscriberPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = `${streamFrontendUrl()}/reset-password?token=${token}`;
    await this.send(
      email,
      'Reset your Dialect Library Voice Stream password',
      passwordResetHtml(url),
      `Reset your password: ${url}`,
      { kind: 'sendSubscriberPasswordResetEmail' },
    );
  }

  async sendSubscriberInviteEmail(params: {
    inviteeEmail: string;
    organizationName: string;
    token: string;
  }): Promise<void> {
    const url = `${streamFrontendUrl()}/register/accept-invite?token=${params.token}`;
    await this.send(
      params.inviteeEmail,
      `You've been invited to join ${params.organizationName} on Dialect Library Voice Stream`,
      `<p>You've been invited to join <strong>${escapeHtml(params.organizationName)}</strong> on Dialect Library Voice Stream.</p><p><a href="${url}">${url}</a></p>`,
      `You've been invited to join ${params.organizationName} on Dialect Library Voice Stream: ${url}`,
      { kind: 'sendSubscriberInviteEmail' },
    );
  }

  async sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const { subject, intro } = otpCopyForPurpose(purpose);
    await this.send(
      email,
      subject,
      otpHtml(intro, code),
      `${intro} Your code: ${code} (expires in 10 minutes).`,
      { kind: 'sendOtpEmail', footer: false },
    );
  }

  async sendDataAccessLeadNotification(lead: DataAccessLeadNotification): Promise<void> {
    const to = await this.settings.getLeadsNotificationAddress();
    await this.send(
      to,
      `New voice data lead: ${lead.name}`,
      dataAccessLeadHtml(lead),
      dataAccessLeadText(lead),
      { kind: 'sendDataAccessLeadNotification' },
    );
  }

  async sendSupportRequestNotification(request: SupportRequestNotification): Promise<void> {
    const to = await this.settings.getLeadsNotificationAddress();
    await this.send(
      to,
      `New support request: ${request.subject}`,
      supportRequestHtml(request),
      supportRequestText(request),
      { kind: 'sendSupportRequestNotification' },
    );
  }

  async sendReferralJoinNotification(payload: ReferralJoinNotification): Promise<void> {
    const referralsUrl = `${frontendUrl()}/dashboard?view=referrals`;
    await this.send(
      payload.inviterEmail,
      'Someone joined your referral network',
      referralJoinHtml(payload.inviteeName, payload.inviteeEmail, referralsUrl),
      referralJoinText(payload.inviteeName, payload.inviteeEmail, referralsUrl),
      { kind: 'sendReferralJoinNotification', optional: true },
    );
  }

  async sendReferralInviteEmail(payload: ReferralInviteEmail): Promise<void> {
    await this.send(
      payload.inviteeEmail,
      `${payload.inviterName} invited you to Dialect Library`,
      referralInviteHtml(payload),
      referralInviteText(payload),
      { kind: 'sendReferralInviteEmail', optional: true },
    );
  }

  /**
   * Fired from WalletController.createTrainingPayout -- covers both an
   * admin's manual "Add DL" credit (frontend/app/admin/users/page.tsx) and
   * any other caller of the same endpoint, since both go through this one
   * controller action. Best-effort: send() already logs+throws on real
   * Resend failures, but the payout itself has already landed by the time
   * this is called, so a caller that wants the payout to still succeed even
   * if the email fails should catch this separately (see call site).
   */
  async sendTrainingPayoutCreditedEmail(
    payload: TrainingPayoutCreditedNotification,
  ): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard?view=tokens`;
    await this.send(
      payload.trainerEmail,
      `You received ${payload.tokenAmount} DL`,
      trainingPayoutCreditedHtml(payload.tokenAmount, payload.reference, dashboardUrl),
      trainingPayoutCreditedText(payload.tokenAmount, payload.reference, dashboardUrl),
      { kind: 'sendTrainingPayoutCreditedEmail' },
    );
  }

  /**
   * Fired from CoursesService.saveProgress the first time a trainer's
   * CourseProgress.completedAt is set for a given course -- always sent,
   * whether or not the course carries a completionRewardTokens reward, so a
   * trainer always gets confirmation of finishing a required course, not
   * just the ones that pay out.
   */
  async sendCourseCompletedEmail(payload: CourseCompletedNotification): Promise<void> {
    const coursesUrl = `${frontendUrl()}/dashboard?view=training`;
    await this.send(
      payload.trainerEmail,
      payload.rewardTokens
        ? `Course complete: ${payload.courseTitle} (+${payload.rewardTokens} DL)`
        : `Course complete: ${payload.courseTitle}`,
      courseCompletedHtml(payload.courseTitle, payload.rewardTokens, coursesUrl),
      courseCompletedText(payload.courseTitle, payload.rewardTokens, coursesUrl),
      { kind: 'sendCourseCompletedEmail', optional: true },
    );
  }

  /**
   * Fired from AuthService.verifyManualPhoneVerificationRequest once an
   * admin confirms a trainer's WhatsApp-submitted code -- best-effort, same
   * as sendTrainingPayoutCreditedEmail: the verification itself has already
   * landed (phoneVerifiedAt set, fee debited) by the time this is called, so
   * the caller catches a failure here separately rather than letting it
   * unwind an already-successful verification.
   */
  /**
   * Fired from WordsService.createRecording the moment a trainer's lifetime
   * WordRecording count crosses a multiple of
   * PlatformSettings.auditHoldEveryNSubmissions -- best-effort, same
   * reasoning as the other post-action emails here: the hold has already
   * been applied by the time this is called.
   */
  async sendAuditHoldStartedEmail(payload: AuditHoldNotification): Promise<void> {
    await this.send(
      payload.trainerEmail,
      'Your account is on hold for a routine review',
      auditHoldStartedHtml(payload.submissionCount),
      auditHoldStartedText(payload.submissionCount),
      { kind: 'sendAuditHoldStartedEmail' },
    );
  }

  /**
   * Fired from AuthService.releaseAuditHold once an admin reviews the
   * trainer's recent work and clears the hold.
   */
  async sendAuditHoldReleasedEmail(email: string): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard`;
    await this.send(
      email,
      'Your account is back in good standing',
      auditHoldReleasedHtml(dashboardUrl),
      auditHoldReleasedText(dashboardUrl),
      { kind: 'sendAuditHoldReleasedEmail' },
    );
  }

  /**
   * Fired by AnomalyDetectionService's hourly cron when a threshold rule
   * breaches for an organization -- one email per OWNER/ADMIN member (the
   * caller loops), best-effort, the AnomalyEvent row is already durable by
   * the time this is called.
   */
  async sendAnomalyAlertEmail(payload: AnomalyAlertNotification): Promise<void> {
    const dashboardUrl = `${streamFrontendUrl()}/dashboard/reports`;
    await this.send(
      payload.recipientEmail,
      `Unusual activity detected on your Voice Stream account`,
      anomalyAlertHtml(payload, dashboardUrl),
      anomalyAlertText(payload, dashboardUrl),
      { kind: 'sendAnomalyAlertEmail' },
    );
  }

  /**
   * Confirms a Dialect Library Connect reservation. Sent best-effort from
   * LeadsController.registerForConnect -- the registration row is already
   * durable by the time this runs, so a mail failure must never surface as
   * a failed reservation.
   *
   * Also sent when the person was already registered: they usually come
   * back precisely because they never saw the first one.
   */
  async sendConnectRegistrationEmail(payload: {
    email: string;
    name: string;
    speaking: boolean;
    alreadyRegistered: boolean;
    /** An existing attendee has just added a speaker application. */
    addedSpeakerApplication?: boolean;
  }): Promise<void> {
    const subject = payload.addedSpeakerApplication
      ? 'We have your Connect 2026 speaker application'
      : payload.alreadyRegistered
        ? "You're already on the list for Connect 2026"
        : payload.speaking
          ? 'We have your Connect 2026 speaker application'
          : 'Your place at Dialect Library Connect 2026 is reserved';
    await this.send(
      payload.email,
      subject,
      connectRegistrationHtml(
        payload.name,
        payload.speaking,
        payload.alreadyRegistered,
        !!payload.addedSpeakerApplication,
      ),
      connectRegistrationText(
        payload.name,
        payload.speaking,
        payload.alreadyRegistered,
        !!payload.addedSpeakerApplication,
      ),
      { kind: 'sendConnectRegistrationEmail', optional: true },
    );
  }

  /**
   * Speaker accepted. Carries the 48-hour photo-upload link, so the one
   * email both delivers the good news and asks for the thing we need next.
   */
  async sendConnectSpeakerApprovedEmail(payload: {
    email: string;
    name: string;
    topic: string;
    photoUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.send(
      payload.email,
      "You're speaking at Dialect Library Connect 2026",
      connectSpeakerApprovedHtml(payload.name, payload.topic, payload.photoUrl, payload.expiresAt),
      connectSpeakerApprovedText(payload.name, payload.topic, payload.photoUrl, payload.expiresAt),
      { kind: 'sendConnectSpeakerApprovedEmail', optional: true },
    );
  }

  async sendConnectSpeakerDeclinedEmail(payload: {
    email: string;
    name: string;
  }): Promise<void> {
    await this.send(
      payload.email,
      'About your Connect 2026 speaker application',
      connectSpeakerDeclinedHtml(payload.name),
      connectSpeakerDeclinedText(payload.name),
      { kind: 'sendConnectSpeakerDeclinedEmail', optional: true },
    );
  }

  /** A fresh photo link for an approved speaker whose first one lapsed. */
  async sendConnectPhotoLinkEmail(payload: {
    email: string;
    name: string;
    topic: string;
    photoUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.send(
      payload.email,
      'Your Connect 2026 speaker photo link',
      connectPhotoLinkHtml(payload.name, payload.topic, payload.photoUrl, payload.expiresAt),
      connectPhotoLinkText(payload.name, payload.topic, payload.photoUrl, payload.expiresAt),
      { kind: 'sendConnectPhotoLinkEmail', optional: true },
    );
  }

  /**
   * Event reminder. `topic` is set only for the speaker audience, so an
   * approved speaker sees their own talk named back to them.
   */
  async sendConnectReminderEmail(payload: {
    email: string;
    name: string;
    message: string | null;
    topic: string | null;
  }): Promise<void> {
    await this.send(
      payload.email,
      payload.topic
        ? 'Your talk at Dialect Library Connect 2026'
        : 'Dialect Library Connect 2026 — a reminder',
      connectReminderHtml(payload.name, payload.message, payload.topic),
      connectReminderText(payload.name, payload.message, payload.topic),
      { kind: 'sendConnectReminderEmail', optional: true },
    );
  }

  async sendPhoneVerifiedEmail(email: string, phoneNumber: string): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard`;
    await this.send(
      email,
      'Your phone number is verified',
      phoneVerifiedHtml(phoneNumber, dashboardUrl),
      phoneVerifiedText(phoneNumber, dashboardUrl),
      { kind: 'sendPhoneVerifiedEmail', optional: true },
    );
  }

  /**
   * Sent when a sell offer is withdrawn because its owner no longer meets
   * the selling gate. Optional: the DL is already back in their balance
   * whether or not this sends, and a mail failure must not stop the
   * withdrawal it is describing.
   */
  async sendP2PSellOfferWithdrawnEmail(
    email: string,
    tokenAmount: string,
    missing: string,
  ): Promise<void> {
    const marketUrl = `${frontendUrl()}/dashboard/market`;
    await this.send(
      email,
      'Your P2P sell offer was withdrawn -- your DL is back in your balance',
      p2pSellOfferWithdrawnHtml(tokenAmount, missing, marketUrl),
      p2pSellOfferWithdrawnText(tokenAmount, missing, marketUrl),
      { kind: 'sendP2PSellOfferWithdrawnEmail', optional: true },
    );
  }

  /** Fired from P2PChatService.sendMessage the first time an admin posts in a disputed trade's thread -- both the buyer and seller get this, not just the party who raised the dispute, since either side may need to respond. */
  async sendP2PAdminJoinedDisputeEmail(email: string, tradeId: string): Promise<void> {
    const tradeUrl = `${frontendUrl()}/dashboard/market-activity`;
    await this.send(
      email,
      'A Dialect Library admin has joined your P2P dispute',
      p2pAdminJoinedDisputeHtml(tradeUrl),
      p2pAdminJoinedDisputeText(tradeUrl),
      { kind: 'sendP2PAdminJoinedDisputeEmail' },
    );
  }

  /** Fired from WhatsAppValidatorService.claim once a peer validator picks up the requester's pending verification, so the requester knows to watch for a WhatsApp message instead of only finding out by opening the app again. */
  async sendWhatsAppValidationClaimedEmail(
    email: string,
    validatorName: string | null,
    validatorPhoneNumber: string | null,
  ): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard`;
    await this.send(
      email,
      'A member is verifying your WhatsApp number',
      whatsAppValidationClaimedHtml(validatorName, validatorPhoneNumber, dashboardUrl),
      whatsAppValidationClaimedText(validatorName, validatorPhoneNumber, dashboardUrl),
      { kind: 'sendWhatsAppValidationClaimedEmail', optional: true },
    );
  }

  /** Fired from KycService.adminDeclineSelfHosted/adminRevokeVerification once an admin declines or revokes an identity verification. */
  async sendKycDeclinedEmail(payload: KycDeclinedNotification): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard`;
    await this.send(
      payload.trainerEmail,
      'Your identity verification needs attention',
      kycDeclinedHtml(payload.reason, dashboardUrl),
      kycDeclinedText(payload.reason, dashboardUrl),
      { kind: 'sendKycDeclinedEmail' },
    );
  }

  /** Fired from weekly-trainer-report.ts's Monday CronJob, once per active trainer, for the trailing 7 days. */
  async sendWeeklyTrainerReportEmail(payload: WeeklyTrainerReportEmail): Promise<void> {
    const reportsUrl = `${frontendUrl()}/dashboard/reports`;
    await this.send(
      payload.trainerEmail,
      'Your weekly Dialect Library report',
      weeklyTrainerReportHtml(payload, reportsUrl),
      weeklyTrainerReportText(payload, reportsUrl),
      { kind: 'sendWeeklyTrainerReportEmail', optional: true },
    );
  }

  /**
   * Self-serve "email me this report" CTA on the trainer's own Reports
   * screen -- unlike sendWeeklyTrainerReportEmail (an HTML summary with no
   * attachment), this always carries the actual rendered PDF so the trainer
   * has a real document to keep/forward, not just a link back to the
   * dashboard.
   */
  async sendTrainerReportPdfEmail(payload: {
    trainerEmail: string;
    trainerFirstName: string | null;
    pdf: Buffer;
  }): Promise<void> {
    const reportsUrl = `${frontendUrl()}/dashboard/reports`;
    const greeting = payload.trainerFirstName ? escapeHtml(payload.trainerFirstName) : 'there';
    await this.send(
      payload.trainerEmail,
      'Your Dialect Library report (PDF)',
      `<p>Hi ${greeting},</p><p>Your requested Dialect Library account report is attached as a PDF.</p><p>You can also view it live any time at <a href="${reportsUrl}">${reportsUrl}</a>.</p>`,
      `Hi ${greeting},\n\nYour requested Dialect Library account report is attached as a PDF.\n\nYou can also view it live any time at ${reportsUrl}\n`,
      { kind: 'sendTrainerReportPdfEmail', attachment: {
          filename: 'dialect-library-report.pdf',
          content: payload.pdf,
          contentType: 'application/pdf',
        },
      },
    );
  }

  /**
   * Admin-triggered "Send to trainer" on the admin Proof Account report
   * (WalletController.sendProofAccountReport) -- unlike
   * sendTrainerReportPdfEmail, this links into the trainer's own dashboard
   * (frontend/app/dashboard/proof-report/[id]) rather than attaching the
   * PDF directly, since the report only becomes visible there once this
   * same admin action creates the ProofReportShare row it depends on; the
   * PDF is downloadable from that page instead.
   */
  async sendProofAccountReportEmail(payload: {
    trainerEmail: string;
    trainerFirstName: string | null;
    userId: string;
  }): Promise<void> {
    const proofUrl = `${frontendUrl()}/dashboard/proof-report/${payload.userId}`;
    const greeting = payload.trainerFirstName ? escapeHtml(payload.trainerFirstName) : 'there';
    await this.send(
      payload.trainerEmail,
      'Your Dialect Library account proof report',
      `<p>Hi ${greeting},</p><p>An admin has prepared a full account proof report for you -- a complete breakdown of your token balance, every transaction, and how they add up.</p><p>View and download it any time at <a href="${proofUrl}">${proofUrl}</a>.</p>`,
      `Hi ${greeting},\n\nAn admin has prepared a full account proof report for you -- a complete breakdown of your token balance, every transaction, and how they add up.\n\nView and download it any time at ${proofUrl}\n`,
      { kind: 'sendProofAccountReportEmail' },
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
    options?: {
      footer?: boolean;
      attachment?: { filename: string; content: Buffer; contentType: string };
      /**
       * MailService method name, recorded on the audit row so volume can be
       * grouped by email type. Defaults to "unknown" rather than being
       * required, so a caller that forgets it still gets logged.
       */
      kind?: string;
      /**
       * Marks this email as optional, i.e. subject to the recipient's
       * emailNotificationsEnabled preference. Defaults to FALSE -- opt-in
       * rather than opt-out, so a new email type is treated as essential
       * until someone deliberately says otherwise. Getting that default
       * backwards would silently drop password resets.
       */
      optional?: boolean;
    },
  ): Promise<void> {
    const kind = options?.kind ?? 'unknown';

    // Honour the recipient's own preference before doing anything else.
    // emailNotificationsEnabled has existed on User (and been editable in
    // the profile) all along, but nothing ever read it -- users who turned
    // it off kept receiving everything. Only ever applied to optional mail:
    // someone who cannot log in has not opted out of a password reset.
    if (options?.optional) {
      const recipient = await this.prisma.user
        .findFirst({
          where: { email: to },
          select: { id: true, emailNotificationsEnabled: true },
        })
        .catch(() => null);
      if (recipient && !recipient.emailNotificationsEnabled) {
        await this.recordSend({
          userId: recipient.id,
          toEmail: to,
          kind,
          subject,
          sent: false,
          suppressedReason: 'USER_OPTED_OUT',
        });
        return;
      }
    }

    const includeFooter = options?.footer ?? true;
    const finalHtml = includeFooter ? html + EMAIL_FOOTER_HTML : html;
    const finalText = includeFooter ? text + EMAIL_FOOTER_TEXT : text;

    if (!this.resend) {
      this.logger.log(`[STUB] ${subject} for ${to}: ${finalText}`);
      return;
    }

    const from = await this.settings.getResendFromAddress();
    const { error } = await this.resend.emails.send({
      from,
      to,
      subject,
      html: finalHtml,
      text: finalText,
      ...(options?.attachment ? { attachments: [options.attachment] } : {}),
    });
    if (error) {
      await this.recordSend({
        toEmail: to,
        kind,
        subject,
        sent: false,
        errorMessage: error.message,
      });
      this.logger.error(`Resend send failed for ${to}: ${error.message}`);
      throw new ServiceUnavailableException('Email delivery is temporarily unavailable');
    }
    await this.recordSend({ toEmail: to, kind, subject, sent: true });
  }

  /**
   * Writes one audit row. Deliberately swallows its own failures: this
   * table exists to measure email, and a logging problem must never take
   * down a password reset or an OTP.
   */
  private async recordSend(entry: {
    userId?: string;
    toEmail: string;
    kind: string;
    subject: string;
    sent: boolean;
    suppressedReason?: string;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const userId =
        entry.userId ??
        (
          await this.prisma.user
            .findFirst({ where: { email: entry.toEmail }, select: { id: true } })
            .catch(() => null)
        )?.id;
      await this.prisma.emailSendLog.create({
        data: {
          userId: userId ?? null,
          toEmail: entry.toEmail,
          kind: entry.kind,
          subject: entry.subject,
          sent: entry.sent,
          suppressedReason: entry.suppressedReason ?? null,
          errorMessage: entry.errorMessage ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Could not record email send log for ${entry.toEmail}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

const EMAIL_FOOTER_HTML = `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;color:#666;font-size:13px;">If you have any questions, please visit our community, chat with our support agent, or send an email to <a href="mailto:hello@dialectlibrary.com">hello@dialectlibrary.com</a> and we will be happy to assist you.</p>
<p style="color:#666;font-size:13px;">Best Regards,<br/>The Dialect Library Team!</p>`;

const EMAIL_FOOTER_TEXT = `

If you have any questions, please visit our community, chat with our support agent, or send an email to hello@dialectlibrary.com and we will be happy to assist you.

Best Regards,
The Dialect Library Team!`;

function passwordResetHtml(url: string): string {
  return `<p>Click below to reset your Dialect Library password. This link expires in 1 hour.</p><p><a href="${url}">${url}</a></p>`;
}

function verifyEmailHtml(url: string): string {
  return `<p>Click below to verify your Dialect Library email address. This link expires in 24 hours.</p><p><a href="${url}">${url}</a></p>`;
}

function magicLinkHtml(url: string): string {
  return `<p>Click below to sign in to Dialect Library. This link expires in 15 minutes.</p><p><a href="${url}">${url}</a></p>`;
}

function otpCopyForPurpose(purpose: OtpPurpose): { subject: string; intro: string } {
  switch (purpose) {
    case 'REGISTRATION':
      return {
        subject: 'Verify your Dialect Library account',
        intro: 'Enter this code to verify your new account.',
      };
    case 'LOGIN':
      return {
        subject: 'Your Dialect Library login code',
        intro: 'Enter this code to finish signing in.',
      };
    case 'WITHDRAWAL':
      return {
        subject: 'Confirm your withdrawal',
        intro: 'Enter this code to confirm your withdrawal request.',
      };
    case 'DEPOSIT':
      return {
        subject: 'Confirm your deposit',
        intro: 'Enter this code to confirm your token purchase.',
      };
    case 'ADMIN_PAYOUT':
      return {
        subject: 'Confirm this payout',
        intro: 'Enter this code to confirm this admin payout action.',
      };
    case 'P2P_PAYMENT_METHOD':
      return {
        subject: 'Confirm your payment method',
        intro: 'Enter this code to save your payment method.',
      };
    case 'PAYOUT_ACCOUNT_DELETE':
      return {
        subject: 'Confirm payout account deletion',
        intro: 'Enter this code to confirm deleting this payout account.',
      };
    case 'PAYOUT_ACCOUNT_SETUP':
      return {
        subject: 'Confirm your payout wallet',
        intro: 'Enter this code to confirm and save this wallet address.',
      };
    case 'PHONE_VERIFICATION':
      // Only ever SMS/WhatsApp-delivered -- OtpService.deliver deliberately
      // excludes this purpose from its email dual-send (proving phone
      // ownership requires the code to actually reach the phone), so this
      // case exists purely so the switch stays exhaustive; sendOtpEmail is
      // never actually called with this purpose in normal operation.
      return {
        subject: 'Verify your phone number',
        intro: 'Enter this code to verify your phone number.',
      };
    case 'P2P_TRADE':
      return {
        subject: 'Confirm your P2P trade',
        intro: 'Enter this code to confirm this P2P market action.',
      };
    case 'SUB_DISTRIBUTOR_ADJUSTMENT':
      return {
        subject: 'Confirm this wallet adjustment',
        intro: 'Enter this code to confirm this sub-distributor wallet adjustment.',
      };
    case 'SUBSCRIBER_EMAIL_VERIFY':
      return {
        subject: 'Verify your Dialect Library Voice Stream account',
        intro: 'Enter this code to verify your new Voice Stream account.',
      };
    case 'SUBSCRIBER_LOGIN':
      return {
        subject: 'Your Dialect Library Voice Stream login code',
        intro: 'Enter this code to finish signing in to Voice Stream.',
      };
    case 'ACCOUNT_CLOSE':
      return {
        subject: 'Confirm closing your account',
        intro: 'Enter this code to confirm closing your Dialect Library account.',
      };
    case 'VDCL_SIGN':
      // Names the act rather than the code. Signing a licence is the most
      // consequential thing a contributor does on the platform, and an
      // email saying only "here is your code" would not tell someone
      // receiving one unexpectedly what is being authorised in their name.
      return {
        subject: 'Confirm signing your Voice Dataset Contributor Licence',
        intro:
          'Enter this code to sign your Voice Dataset Contributor Licence. Only use it if you are signing your licence right now.',
      };
    case 'TRAINING_ECONOMY_TOGGLE':
      // Says which DIRECTION is being authorised, because the two are not
      // equally consequential: stopping payouts changes what every trainer
      // earns from their next recording onward, and resuming them starts
      // creating new withdrawal liabilities again.
      return {
        subject: 'Change the training payout system platform-wide',
        intro:
          'Enter this code to switch the stake-and-payout training economy on or off for every trainer. While it is off, recording costs nothing and earns no DL. This does not affect any balance already earned.',
      };
    case 'VDCL_COUNTERSIGN':
      // Names the counterparty, not just the act. Countersigning is
      // executed on behalf of the parent company, and an admin receiving
      // this code is binding Golojan Technologies LLC to a commercial
      // licence over someone's voice -- the email should say so.
      return {
        subject: 'Countersign a contributor licence for Golojan Technologies LLC',
        intro:
          'Enter this code to countersign a Voice Dataset Contributor Licence on behalf of Golojan Technologies LLC. This grants commercial rights over a contributor’s recordings and issues their licence documents.',
      };
  }
}

function otpHtml(intro: string, code: string): string {
  return `<p>${intro}</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;font-family:monospace;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dataAccessLeadHtml(lead: DataAccessLeadNotification): string {
  return `<p>New "Subscribe to voice data" lead:</p>
<ul>
  <li>Name: ${escapeHtml(lead.name)}</li>
  <li>Email: ${escapeHtml(lead.email)}</li>
  <li>Organization: ${lead.organization ? escapeHtml(lead.organization) : '(not provided)'}</li>
  <li>Website: ${lead.website ? escapeHtml(lead.website) : '(not provided)'}</li>
  <li>Countries interested in: ${lead.countriesInterested ? escapeHtml(lead.countriesInterested) : '(not provided)'}</li>
</ul>`;
}

function dataAccessLeadText(lead: DataAccessLeadNotification): string {
  return `New "Subscribe to voice data" lead:
Name: ${lead.name}
Email: ${lead.email}
Organization: ${lead.organization ?? '(not provided)'}
Website: ${lead.website ?? '(not provided)'}
Countries interested in: ${lead.countriesInterested ?? '(not provided)'}`;
}

function supportRequestHtml(request: SupportRequestNotification): string {
  return `<p>New Contact Us support request:</p>
<ul>
  <li>Name: ${escapeHtml(request.name)}</li>
  <li>Email: ${escapeHtml(request.email)}</li>
  <li>Subject: ${escapeHtml(request.subject)}</li>
</ul>
<p>${escapeHtml(request.message).replace(/\n/g, '<br>')}</p>`;
}

function supportRequestText(request: SupportRequestNotification): string {
  return `New Contact Us support request:
Name: ${request.name}
Email: ${request.email}
Subject: ${request.subject}

${request.message}`;
}

function referralJoinHtml(inviteeName: string, inviteeEmail: string, referralsUrl: string): string {
  return `<p>Good news. Someone just joined your referral network on Dialect Library.</p>
<ul>
  <li>Name: ${escapeHtml(inviteeName)}</li>
  <li>Email: ${escapeHtml(inviteeEmail)}</li>
</ul>
<p>Track your referrals and bonus activity here:</p>
<p><a href="${referralsUrl}">${referralsUrl}</a></p>`;
}

function referralJoinText(inviteeName: string, inviteeEmail: string, referralsUrl: string): string {
  return `Someone joined your referral network on Dialect Library.
Name: ${inviteeName}
Email: ${inviteeEmail}
Track your referrals: ${referralsUrl}`;
}

const ANOMALY_RULE_LABELS: Record<string, string> = {
  denial_rate_spike: 'a spike in denied requests',
  new_ip_burst: 'a burst of requests from new IP addresses',
  request_volume_spike: 'a spike in request volume',
};

function anomalyAlertHtml(payload: AnomalyAlertNotification, dashboardUrl: string): string {
  const ruleLabel = ANOMALY_RULE_LABELS[payload.ruleKey] ?? payload.ruleKey;
  return `<p>We detected ${escapeHtml(ruleLabel)} on ${escapeHtml(payload.organizationName)}'s Voice Stream account between ${payload.windowStart.toISOString()} and ${payload.windowEnd.toISOString()}.</p>
<p>Details: ${escapeHtml(JSON.stringify(payload.details))}</p>
<p>If this wasn't expected, review your Stream Keys and OAuth clients for anything that looks unfamiliar.</p>
<p><a href="${dashboardUrl}">${dashboardUrl}</a></p>`;
}

function anomalyAlertText(payload: AnomalyAlertNotification, dashboardUrl: string): string {
  const ruleLabel = ANOMALY_RULE_LABELS[payload.ruleKey] ?? payload.ruleKey;
  return `We detected ${ruleLabel} on ${payload.organizationName}'s Voice Stream account between ${payload.windowStart.toISOString()} and ${payload.windowEnd.toISOString()}.
Details: ${JSON.stringify(payload.details)}
If this wasn't expected, review your Stream Keys and OAuth clients for anything that looks unfamiliar.
${dashboardUrl}`;
}

function referralInviteHtml(payload: ReferralInviteEmail): string {
  return `<p>Hi ${escapeHtml(payload.inviteeFirstName)},</p>
<p>${escapeHtml(payload.inviterName)} (${escapeHtml(payload.inviterEmail)}) invited you to join Dialect Library.</p>
<p>Use this invite link to create your account:</p>
<p><a href="${payload.referralUrl}">${payload.referralUrl}</a></p>
<p>This link connects your account to ${escapeHtml(payload.inviterName)}'s referral network.</p>`;
}

function referralInviteText(payload: ReferralInviteEmail): string {
  return `Hi ${payload.inviteeFirstName},
${payload.inviterName} (${payload.inviterEmail}) invited you to join Dialect Library.
Use this invite link to create your account:
${payload.referralUrl}

This link connects your account to ${payload.inviterName}'s referral network.`;
}

function trainingPayoutCreditedHtml(
  tokenAmount: string,
  reference: string | null,
  dashboardUrl: string,
): string {
  return `<p><strong>${escapeHtml(tokenAmount)} DL</strong> has been added to your Dialect Library wallet.</p>
${reference ? `<p>Reason: ${escapeHtml(reference)}</p>` : ''}
<p>View your balance and activity here:</p>
<p><a href="${dashboardUrl}">${dashboardUrl}</a></p>`;
}

function trainingPayoutCreditedText(
  tokenAmount: string,
  reference: string | null,
  dashboardUrl: string,
): string {
  return `${tokenAmount} DL has been added to your Dialect Library wallet.
${reference ? `Reason: ${reference}\n` : ''}View your balance: ${dashboardUrl}`;
}

function courseCompletedHtml(
  courseTitle: string,
  rewardTokens: string | null,
  coursesUrl: string,
): string {
  return `<p>You've completed <strong>${escapeHtml(courseTitle)}</strong>.</p>
${rewardTokens ? `<p><strong>${escapeHtml(rewardTokens)} DL</strong> has been added to your Dialect Library wallet for completing this course.</p>` : ''}
<p><a href="${coursesUrl}">Continue training</a></p>`;
}

function courseCompletedText(
  courseTitle: string,
  rewardTokens: string | null,
  coursesUrl: string,
): string {
  return `You've completed ${courseTitle}.
${rewardTokens ? `${rewardTokens} DL has been added to your Dialect Library wallet for completing this course.\n` : ''}Continue training: ${coursesUrl}`;
}

function auditHoldStartedHtml(submissionCount: number): string {
  return `<p>Thanks for your work on Dialect Library &mdash; you&rsquo;ve now submitted <strong>${submissionCount}</strong> recordings.</p>
<p>As part of our routine quality process, your account is temporarily on hold while a member of our team reviews your recent submissions. This is a standard check, not a penalty.</p>
<p>You won&rsquo;t be able to start new training tasks until the review is complete. We&rsquo;ll email you as soon as your account is released &mdash; this usually doesn&rsquo;t take long.</p>`;
}

function auditHoldStartedText(submissionCount: number): string {
  return `Thanks for your work on Dialect Library -- you've now submitted ${submissionCount} recordings.
As part of our routine quality process, your account is temporarily on hold while a member of our team reviews your recent submissions. This is a standard check, not a penalty.
You won't be able to start new training tasks until the review is complete. We'll email you as soon as your account is released -- this usually doesn't take long.`;
}

function auditHoldReleasedHtml(dashboardUrl: string): string {
  return `<p>Good news &mdash; your account review is complete and your account is back in good standing.</p>
<p>You can resume training right away.</p>
<p><a href="${dashboardUrl}">Go to your dashboard</a></p>`;
}

function auditHoldReleasedText(dashboardUrl: string): string {
  return `Good news -- your account review is complete and your account is back in good standing.
You can resume training right away.
Go to your dashboard: ${dashboardUrl}`;
}

function connectRegistrationHtml(
  name: string,
  speaking: boolean,
  alreadyRegistered: boolean,
  addedSpeakerApplication: boolean,
): string {
  const opening = addedSpeakerApplication
    ? `<p>Hi ${escapeHtml(name)}, thank you &mdash; we have your speaker application for <strong>Dialect Library Connect 2026</strong>. Your place as an attendee is unchanged.</p>`
    : alreadyRegistered
      ? `<p>Hi ${escapeHtml(name)}, you are already on the list for <strong>Dialect Library Connect 2026</strong> &mdash; there is nothing more to do.</p>`
      : `<p>Hi ${escapeHtml(name)}, your place at <strong>Dialect Library Connect 2026</strong> is reserved. Thank you for joining us.</p>`;
  const speakerLine = speaking
    ? '<p>Our team reviews every speaker submission and will be in touch about yours by email.</p>'
    : '';
  return `${opening}
${speakerLine}
<p>The event is planned for <strong>October 2026</strong> and will be held online. We will email the exact date, time and joining link as soon as they are confirmed.</p>
<p>See you there.</p>`;
}

function connectRegistrationText(
  name: string,
  speaking: boolean,
  alreadyRegistered: boolean,
  addedSpeakerApplication: boolean,
): string {
  const opening = addedSpeakerApplication
    ? `Hi ${name}, thank you -- we have your speaker application for Dialect Library Connect 2026. Your place as an attendee is unchanged.`
    : alreadyRegistered
      ? `Hi ${name}, you are already on the list for Dialect Library Connect 2026 -- there is nothing more to do.`
      : `Hi ${name}, your place at Dialect Library Connect 2026 is reserved. Thank you for joining us.`;
  const speakerLine = speaking
    ? '\nOur team reviews every speaker submission and will be in touch about yours by email.'
    : '';
  return `${opening}
${speakerLine}
The event is planned for October 2026 and will be held online. We will email the exact date, time and joining link as soon as they are confirmed.

See you there.`;
}

/** "22 September 2026 at 14:30 UTC" -- unambiguous across time zones. */
function formatDeadline(expiresAt: Date): string {
  return `${expiresAt.toUTCString().replace(' GMT', '')} UTC`;
}

function connectSpeakerApprovedHtml(
  name: string,
  topic: string,
  photoUrl: string,
  expiresAt: Date,
): string {
  const topicLine = topic
    ? `<p>Your talk: <strong>${escapeHtml(topic)}</strong></p>`
    : '';
  return `<p>Hi ${escapeHtml(name)}, we are delighted to confirm you as a speaker at <strong>Dialect Library Connect 2026</strong>.</p>
${topicLine}
<p>One thing we need from you: a photo for the event page.</p>
<p><a href="${photoUrl}">Upload your speaker photo</a></p>
<p>This link works until <strong>${escapeHtml(formatDeadline(expiresAt))}</strong>. If it expires before you get to it, just reply and we will send a new one.</p>
<p>We will follow up with the running order and joining details closer to the event.</p>`;
}

function connectSpeakerApprovedText(
  name: string,
  topic: string,
  photoUrl: string,
  expiresAt: Date,
): string {
  const topicLine = topic ? `\nYour talk: ${topic}\n` : '';
  return `Hi ${name}, we are delighted to confirm you as a speaker at Dialect Library Connect 2026.
${topicLine}
One thing we need from you: a photo for the event page.

Upload your speaker photo: ${photoUrl}

This link works until ${formatDeadline(expiresAt)}. If it expires before you get to it, just reply and we will send a new one.

We will follow up with the running order and joining details closer to the event.`;
}

function connectSpeakerDeclinedHtml(name: string): string {
  return `<p>Hi ${escapeHtml(name)}, thank you for offering to speak at Dialect Library Connect 2026.</p>
<p>We had more proposals than slots this time, and we are not able to include your talk in the programme. That is a reflection of the number of submissions, not of your work.</p>
<p>Your place as an attendee is still reserved, and we would be glad to see you there. We would also welcome a proposal from you at the next Connect.</p>`;
}

function connectSpeakerDeclinedText(name: string): string {
  return `Hi ${name}, thank you for offering to speak at Dialect Library Connect 2026.

We had more proposals than slots this time, and we are not able to include your talk in the programme. That is a reflection of the number of submissions, not of your work.

Your place as an attendee is still reserved, and we would be glad to see you there. We would also welcome a proposal from you at the next Connect.`;
}

function connectPhotoLinkHtml(
  name: string,
  topic: string,
  photoUrl: string,
  expiresAt: Date,
): string {
  const topicLine = topic ? `<p>Your talk: <strong>${escapeHtml(topic)}</strong></p>` : '';
  return `<p>Hi ${escapeHtml(name)}, here is a fresh link to add your speaker photo for <strong>Connect 2026</strong>.</p>
${topicLine}
<p><a href="${photoUrl}">Upload your speaker photo</a></p>
<p>This link works until <strong>${escapeHtml(formatDeadline(expiresAt))}</strong>.</p>`;
}

function connectPhotoLinkText(
  name: string,
  topic: string,
  photoUrl: string,
  expiresAt: Date,
): string {
  const topicLine = topic ? `\nYour talk: ${topic}\n` : '';
  return `Hi ${name}, here is a fresh link to add your speaker photo for Connect 2026.
${topicLine}
Upload your speaker photo: ${photoUrl}

This link works until ${formatDeadline(expiresAt)}.`;
}

function connectReminderHtml(
  name: string,
  message: string | null,
  topic: string | null,
): string {
  const note = message ? `<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>` : '';
  const topicLine = topic
    ? `<p>You are speaking on: <strong>${escapeHtml(topic)}</strong></p>`
    : '';
  return `<p>Hi ${escapeHtml(name)}, a reminder about <strong>Dialect Library Connect 2026</strong>.</p>
${topicLine}
${note}
<p>The event takes place in <strong>October 2026</strong>, online. We will send the joining link before the day.</p>
<p>See you there.</p>`;
}

function connectReminderText(
  name: string,
  message: string | null,
  topic: string | null,
): string {
  const note = message ? `\n${message}\n` : '';
  const topicLine = topic ? `\nYou are speaking on: ${topic}\n` : '';
  return `Hi ${name}, a reminder about Dialect Library Connect 2026.
${topicLine}${note}
The event takes place in October 2026, online. We will send the joining link before the day.

See you there.`;
}

function phoneVerifiedHtml(phoneNumber: string, dashboardUrl: string): string {
  return `<p>Your phone number <strong>${escapeHtml(phoneNumber)}</strong> has been verified.</p>
<p>You can now request withdrawals and trade on the P2P market.</p>
<p><a href="${dashboardUrl}">Go to your dashboard</a></p>`;
}

function phoneVerifiedText(phoneNumber: string, dashboardUrl: string): string {
  return `Your phone number ${phoneNumber} has been verified.
You can now request withdrawals and trade on the P2P market.
Go to your dashboard: ${dashboardUrl}`;
}

function p2pSellOfferWithdrawnHtml(
  tokenAmount: string,
  missing: string,
  marketUrl: string,
): string {
  return `<p>We have taken your P2P sell offer for <strong>${escapeHtml(tokenAmount)} DL</strong> off the market, and returned the DL to your available balance. Nothing has been lost -- you can spend it or list it again.</p>
<p>Selling on the P2P market now needs a verified mobile number, approved identity verification (KYC), and a completed-task history. Your account is missing: <strong>${escapeHtml(missing)}</strong>.</p>
<p>Once that is sorted you can post a new sell offer straight away.</p>
<p><a href="${marketUrl}">Go to the P2P market</a></p>`;
}

function p2pSellOfferWithdrawnText(
  tokenAmount: string,
  missing: string,
  marketUrl: string,
): string {
  return `We have taken your P2P sell offer for ${tokenAmount} DL off the market, and returned the DL to your available balance. Nothing has been lost -- you can spend it or list it again.
Selling on the P2P market now needs a verified mobile number, approved identity verification (KYC), and a completed-task history. Your account is missing: ${missing}.
Once that is sorted you can post a new sell offer straight away.
Go to the P2P market: ${marketUrl}`;
}

function p2pAdminJoinedDisputeHtml(tradeUrl: string): string {
  return `<p>A Dialect Library admin has joined the conversation on your disputed P2P trade.</p>
<p>Reply in the trade conversation with any additional details or proof -- the admin will review and resolve the dispute from there.</p>
<p><a href="${tradeUrl}">View the trade</a></p>`;
}

function p2pAdminJoinedDisputeText(tradeUrl: string): string {
  return `A Dialect Library admin has joined the conversation on your disputed P2P trade.
Reply in the trade conversation with any additional details or proof -- the admin will review and resolve the dispute from there.
View the trade: ${tradeUrl}`;
}

function whatsAppValidationClaimedHtml(
  validatorName: string | null,
  validatorPhoneNumber: string | null,
  dashboardUrl: string,
): string {
  const who = validatorName ? escapeHtml(validatorName) : 'A member';
  const contact = validatorPhoneNumber
    ? ` at <strong>${escapeHtml(validatorPhoneNumber)}</strong>`
    : '';
  return `<p>${who}${contact} has picked up your WhatsApp verification request and will contact you shortly to ask for your code.</p>
<p>Only share your code with this exact name and number.</p>
<p><a href="${dashboardUrl}">Go to your dashboard</a></p>`;
}

function whatsAppValidationClaimedText(
  validatorName: string | null,
  validatorPhoneNumber: string | null,
  dashboardUrl: string,
): string {
  const who = validatorName ?? 'A member';
  const contact = validatorPhoneNumber ? ` at ${validatorPhoneNumber}` : '';
  return `${who}${contact} has picked up your WhatsApp verification request and will contact you shortly to ask for your code.
Only share your code with this exact name and number.
Go to your dashboard: ${dashboardUrl}`;
}

function kycDeclinedHtml(reason: string, dashboardUrl: string): string {
  return `<p>We weren&rsquo;t able to verify your identity with the details you submitted.</p>
<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
<p>You can review this and submit a new verification from your dashboard.</p>
<p><a href="${dashboardUrl}">Go to your dashboard</a></p>`;
}

function kycDeclinedText(reason: string, dashboardUrl: string): string {
  return `We weren't able to verify your identity with the details you submitted.
Reason: ${reason}
You can review this and submit a new verification from your dashboard.
Go to your dashboard: ${dashboardUrl}`;
}

function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date);
}

// Widest day's bar is always the full cap width; others scale proportionally.
// Fixed-pixel <td> width rather than percentage, since most email clients
// don't run flex/grid reliably -- a plain <table> with pixel-width cells is
// the one layout approach that renders consistently across clients.
const WEEKLY_REPORT_BAR_MAX_PX = 200;
function barWidthPx(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(2, Math.round((value / max) * WEEKLY_REPORT_BAR_MAX_PX));
}

function weeklyTrainerReportHtml(payload: WeeklyTrainerReportEmail, reportsUrl: string): string {
  const greeting = payload.trainerFirstName ? escapeHtml(payload.trainerFirstName) : 'there';
  const maxRecordings = Math.max(...payload.daily.map((day) => day.recordings), 1);
  const rows = payload.daily
    .map(
      (day) => `
  <tr>
    <td style="padding:4px 8px 4px 0;font-size:12px;color:#666;white-space:nowrap">${escapeHtml(formatDayLabel(day.date))}</td>
    <td style="padding:4px 0">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td style="background:#2f7a4f;height:14px;width:${barWidthPx(day.recordings, maxRecordings)}px;line-height:14px;font-size:0">&nbsp;</td>
        <td style="padding-left:6px;font-size:12px;color:#333">${day.recordings}</td>
      </tr></table>
    </td>
  </tr>`,
    )
    .join('');

  return `<p>Hi ${greeting},</p>
<p>Here's your Dialect Library summary for the past week:</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0">
  <tr>
    <td style="padding:8px;border:1px solid #e5e5e5;text-align:center"><strong>${payload.recordings}</strong><br/>Recordings</td>
    <td style="padding:8px;border:1px solid #e5e5e5;text-align:center"><strong>${payload.avgScore ?? '—'}</strong><br/>Avg. score</td>
    <td style="padding:8px;border:1px solid #e5e5e5;text-align:center"><strong>${escapeHtml(payload.totalEarningsTokens)} DL</strong><br/>Earned this week</td>
  </tr>
</table>
<p style="margin-bottom:4px"><strong>Daily recordings</strong></p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>
<p><a href="${reportsUrl}">View your full report and export as PDF</a></p>`;
}

function weeklyTrainerReportText(payload: WeeklyTrainerReportEmail, reportsUrl: string): string {
  return `Hi ${payload.trainerFirstName ?? 'there'},
Here's your Dialect Library summary for the past week:
Recordings: ${payload.recordings}
Avg. score: ${payload.avgScore ?? 'n/a'}
Earned this week: ${payload.totalEarningsTokens} DL
View your full report: ${reportsUrl}`;
}
