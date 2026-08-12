import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { OtpPurpose } from '@dialectiva/db';
import { PlatformSettingsService } from '../settings/platform-settings.service';

interface DataAccessLeadNotification {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  useCase: string | null;
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
  <li>Use case: ${lead.useCase ? escapeHtml(lead.useCase) : '(not provided)'}</li>
</ul>`;
}

function dataAccessLeadText(lead: DataAccessLeadNotification): string {
  return `New "Subscribe to voice data" lead:
Name: ${lead.name}
Email: ${lead.email}
Organization: ${lead.organization ?? '(not provided)'}
Use case: ${lead.useCase ?? '(not provided)'}`;
}
