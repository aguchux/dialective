import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { OtpPurpose } from '@dialectiva/db';
import { PlatformSettingsService } from '../settings/platform-settings.service';

interface DataAccessLeadNotification {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  website: string | null;
  countriesInterested: string | null;
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

  constructor(private readonly settings: PlatformSettingsService) {
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
    );
  }

  async sendEmailVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${frontendUrl()}/verify-email?token=${token}`;
    await this.send(
      email,
      'Verify your Dialect Library email',
      verifyEmailHtml(url),
      `Verify your email: ${url}`,
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
    );
  }

  async sendSubscriberPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = `${streamFrontendUrl()}/reset-password?token=${token}`;
    await this.send(
      email,
      'Reset your Dialect Library Voice Stream password',
      passwordResetHtml(url),
      `Reset your password: ${url}`,
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
    );
  }

  async sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const { subject, intro } = otpCopyForPurpose(purpose);
    await this.send(
      email,
      subject,
      otpHtml(intro, code),
      `${intro} Your code: ${code} (expires in 10 minutes).`,
    );
  }

  async sendDataAccessLeadNotification(lead: DataAccessLeadNotification): Promise<void> {
    const to = await this.settings.getLeadsNotificationAddress();
    await this.send(
      to,
      `New voice data lead: ${lead.name}`,
      dataAccessLeadHtml(lead),
      dataAccessLeadText(lead),
    );
  }

  async sendReferralJoinNotification(payload: ReferralJoinNotification): Promise<void> {
    const referralsUrl = `${frontendUrl()}/dashboard?view=referrals`;
    await this.send(
      payload.inviterEmail,
      'Someone joined your referral network',
      referralJoinHtml(payload.inviteeName, payload.inviteeEmail, referralsUrl),
      referralJoinText(payload.inviteeName, payload.inviteeEmail, referralsUrl),
    );
  }

  async sendReferralInviteEmail(payload: ReferralInviteEmail): Promise<void> {
    await this.send(
      payload.inviteeEmail,
      `${payload.inviterName} invited you to Dialect Library`,
      referralInviteHtml(payload),
      referralInviteText(payload),
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
    );
  }

  async sendPhoneVerifiedEmail(email: string, phoneNumber: string): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard`;
    await this.send(
      email,
      'Your phone number is verified',
      phoneVerifiedHtml(phoneNumber, dashboardUrl),
      phoneVerifiedText(phoneNumber, dashboardUrl),
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
    );
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[STUB] ${subject} for ${to}: ${text}`);
      return;
    }

    const from = await this.settings.getResendFromAddress();
    const { error } = await this.resend.emails.send({ from, to, subject, html, text });
    if (error) {
      this.logger.error(`Resend send failed for ${to}: ${error.message}`);
      throw new ServiceUnavailableException('Email delivery is temporarily unavailable');
    }
  }
}

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
    case 'PHONE_VERIFICATION':
      // Always SMS-delivered in practice (see OtpService.deliver) -- this
      // case exists only so the switch stays exhaustive if ever called by mistake.
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
