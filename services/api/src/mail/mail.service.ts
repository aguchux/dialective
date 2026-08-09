import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'noreply@dialectlibrary.com';
const LEADS_NOTIFICATION_ADDRESS = process.env.LEADS_NOTIFICATION_ADDRESS ?? 'hello@dialectlibrary.com';

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

  constructor() {
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

  async sendDataAccessLeadNotification(lead: DataAccessLeadNotification): Promise<void> {
    await this.send(
      LEADS_NOTIFICATION_ADDRESS,
      `New voice data lead: ${lead.name}`,
      dataAccessLeadHtml(lead),
      dataAccessLeadText(lead),
    );
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[STUB] ${subject} for ${to}: ${text}`);
      return;
    }

    const { error } = await this.resend.emails.send({ from: FROM_ADDRESS, to, subject, html, text });
    if (error) {
      this.logger.error(`Resend send failed for ${to}: ${error.message}`);
      throw new Error(`Failed to send email: ${error.message}`);
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
