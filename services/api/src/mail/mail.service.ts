import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'noreply@dialective.com';

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'https://app.dialective.com';
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
    await this.send(email, 'Reset your Dialectiva password', passwordResetHtml(url), `Reset your password: ${url}`);
  }

  async sendEmailVerificationEmail(email: string, token: string): Promise<void> {
    const url = `${frontendUrl()}/verify-email?token=${token}`;
    await this.send(email, 'Verify your Dialectiva email', verifyEmailHtml(url), `Verify your email: ${url}`);
  }

  async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    // Points at a frontend page (not api directly) -- consuming the token
    // is a server-to-server call guarded by OAUTH_CALLBACK_SECRET, so a
    // browser can't call api's /auth/magic-link/callback on its own. The
    // frontend page exchanges the token via its own server-side route and
    // then establishes the NextAuth session. See AGENTS.md "Authentication".
    const url = `${frontendUrl()}/magic-link?token=${token}`;
    await this.send(email, 'Your Dialectiva sign-in link', magicLinkHtml(url), `Sign in: ${url}`);
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
  return `<p>Click below to reset your Dialectiva password. This link expires in 1 hour.</p><p><a href="${url}">${url}</a></p>`;
}

function verifyEmailHtml(url: string): string {
  return `<p>Click below to verify your Dialectiva email address. This link expires in 24 hours.</p><p><a href="${url}">${url}</a></p>`;
}

function magicLinkHtml(url: string): string {
  return `<p>Click below to sign in to Dialectiva. This link expires in 15 minutes.</p><p><a href="${url}">${url}</a></p>`;
}
