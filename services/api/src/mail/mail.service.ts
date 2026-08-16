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

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'https://dialectlibrary.com';
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
    await this.send(email, 'Reset your Dialect Library password', passwordResetHtml(url), `Reset your password: ${url}`);
  }

  async sendEmailVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${frontendUrl()}/verify-email?token=${token}`;
    await this.send(email, 'Verify your Dialect Library email', verifyEmailHtml(url), `Verify your email: ${url}`);
  }

  async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    // Points at a frontend page (not api directly) -- consuming the token
    // is a server-to-server call guarded by OAUTH_CALLBACK_SECRET, so a
    // browser can't call api's /auth/magic-link/callback on its own. The
    // frontend page exchanges the token via its own server-side route and
    // then establishes the NextAuth session. See AGENTS.md "Authentication".
    const url = `${frontendUrl()}/magic-link?token=${token}`;
    await this.send(email, 'Your Dialect Library sign-in link', magicLinkHtml(url), `Sign in: ${url}`);
  }

  async sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const { subject, intro } = otpCopyForPurpose(purpose);
    await this.send(email, subject, otpHtml(intro, code), `${intro} Your code: ${code} (expires in 10 minutes).`);
  }

  async sendDataAccessLeadNotification(lead: DataAccessLeadNotification): Promise<void> {
    const to = await this.settings.getLeadsNotificationAddress();
    await this.send(to, `New voice data lead: ${lead.name}`, dataAccessLeadHtml(lead), dataAccessLeadText(lead));
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
  async sendTrainingPayoutCreditedEmail(payload: TrainingPayoutCreditedNotification): Promise<void> {
    const dashboardUrl = `${frontendUrl()}/dashboard?view=tokens`;
    await this.send(
      payload.trainerEmail,
      `You received ${payload.tokenAmount} DL`,
      trainingPayoutCreditedHtml(payload.tokenAmount, payload.reference, dashboardUrl),
      trainingPayoutCreditedText(payload.tokenAmount, payload.reference, dashboardUrl),
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
      return { subject: 'Verify your Dialect Library account', intro: 'Enter this code to verify your new account.' };
    case 'LOGIN':
      return { subject: 'Your Dialect Library login code', intro: 'Enter this code to finish signing in.' };
    case 'WITHDRAWAL':
      return { subject: 'Confirm your withdrawal', intro: 'Enter this code to confirm your withdrawal request.' };
    case 'DEPOSIT':
      return { subject: 'Confirm your deposit', intro: 'Enter this code to confirm your token purchase.' };
    case 'ADMIN_PAYOUT':
      return { subject: 'Confirm this payout', intro: 'Enter this code to confirm this admin payout action.' };
    case 'P2P_PAYMENT_METHOD':
      return { subject: 'Confirm your payment method', intro: 'Enter this code to save your payment method.' };
    case 'PHONE_VERIFICATION':
      // Always SMS-delivered in practice (see OtpService.deliver) -- this
      // case exists only so the switch stays exhaustive if ever called by mistake.
      return { subject: 'Verify your phone number', intro: 'Enter this code to verify your phone number.' };
    case 'P2P_TRADE':
      return { subject: 'Confirm your P2P trade', intro: 'Enter this code to confirm this P2P market action.' };
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

function trainingPayoutCreditedHtml(tokenAmount: string, reference: string | null, dashboardUrl: string): string {
  return `<p><strong>${escapeHtml(tokenAmount)} DL</strong> has been added to your Dialect Library wallet.</p>
${reference ? `<p>Reason: ${escapeHtml(reference)}</p>` : ''}
<p>View your balance and activity here:</p>
<p><a href="${dashboardUrl}">${dashboardUrl}</a></p>`;
}

function trainingPayoutCreditedText(tokenAmount: string, reference: string | null, dashboardUrl: string): string {
  return `${tokenAmount} DL has been added to your Dialect Library wallet.
${reference ? `Reason: ${reference}\n` : ''}View your balance: ${dashboardUrl}`;
}
