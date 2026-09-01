import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import Stripe from 'stripe';
import { ApiAccessTokensService } from '../api-access-tokens/api-access-tokens.service';
import type { PayoutProvider, ProviderPayoutStatus } from './payout-provider.interface';

export interface CreateConnectedAccountParams {
  email: string;
  country: string;
}

export interface CreateConnectedAccountResult {
  stripeAccountId: string;
}

export interface CreateOnboardingLinkResult {
  url: string;
}

export interface AccountStatusResult {
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  raw: Record<string, unknown>;
}

export interface CreateTransferParams {
  stripeAccountId: string;
  amountUsdCents: number;
  reference: string;
  narration: string;
}

export interface TransferResult {
  transferId: string;
  status: string | null;
  raw: Record<string, unknown>;
}

/**
 * Third fiat payout rail alongside FlutterwaveService/FlutterwaveV4Service --
 * Stripe Connect Express. Same "one class per external integration" shape
 * as FlutterwaveService: no constructor DI, env vars read lazily via
 * getters that fail fast on first use, typed results never leak raw
 * provider JSON to callers, every failure is logged server-side and
 * surfaced as a generic BadGatewayException. Unlike FlutterwaveService this
 * uses the official `stripe` SDK rather than raw fetch -- correct here,
 * since the SDK already handles webhook signature verification/retries/
 * typed responses for us and voice-stream/billing already depends on it.
 *
 * Model: each trainer who opts into Stripe gets a Connect Express account
 * (createConnectedAccount); identity + bank-account entry happen entirely
 * on Stripe-hosted pages via an Account Link (createOnboardingLink) -- we
 * never see raw bank details for this rail. The platform later moves funds
 * to the connected account's Stripe balance via a Transfer (createTransfer);
 * the actual bank payout happens later still, on Stripe's own automatic
 * payout schedule for that connected account, which we don't control or
 * observe per-transfer.
 *
 * Unlike FlutterwaveService, credentials are NOT read from env vars --
 * voice-stream/billing already established the pattern of storing the
 * Stripe secret key as an admin-rotatable ApiAccessToken row
 * (stripe_secret_key, encrypted at rest, set via the admin "Stripe Keys"
 * panel) rather than a k8s env var, and this is the same Stripe account/key
 * for both Checkout and Connect, so it's reused here rather than requiring
 * a second place to configure the same credential. The Connect webhook
 * endpoint is different from the Checkout one, so it gets its own token key
 * (stripe_connect_webhook_secret).
 */
@Injectable()
export class StripeConnectService implements PayoutProvider {
  private readonly logger = new Logger(StripeConnectService.name);

  constructor(private readonly apiAccessTokens: ApiAccessTokensService) {}

  private async secretKey(): Promise<string> {
    const key = await this.apiAccessTokens.getDecrypted('stripe_secret_key');
    if (!key) {
      throw new Error('The stripe_secret_key API access token is not configured');
    }
    return key;
  }

  private async webhookSecret(): Promise<string> {
    const secret = await this.apiAccessTokens.getDecrypted('stripe_connect_webhook_secret');
    if (!secret) {
      throw new Error('The stripe_connect_webhook_secret API access token is not configured');
    }
    return secret;
  }

  private async stripe(): Promise<Stripe> {
    // Constructed fresh per call rather than cached -- the secret key is
    // admin-rotatable at runtime (unlike FlutterwaveService's env-var
    // getters), so caching a client across a rotation would keep using the
    // old key. The SDK client itself is cheap to construct.
    return new Stripe(await this.secretKey());
  }

  async createConnectedAccount(
    params: CreateConnectedAccountParams,
  ): Promise<CreateConnectedAccountResult> {
    // this.stripe() is resolved outside the try -- a missing/unconfigured
    // secret must propagate as-is (matching FlutterwaveService's fail-fast
    // lazy getters), not get swallowed into a generic BadGatewayException
    // the way an actual provider-call failure below does.
    const stripe = await this.stripe();
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: params.country,
        email: params.email,
        capabilities: { transfers: { requested: true } },
      });
      return { stripeAccountId: account.id };
    } catch (err) {
      this.logSdkError('createConnectedAccount', err);
      throw new BadGatewayException(
        'The payout provider could not create a connected account. Please try again.',
      );
    }
  }

  async createOnboardingLink(
    stripeAccountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<CreateOnboardingLinkResult> {
    const stripe = await this.stripe();
    try {
      const link = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      return { url: link.url };
    } catch (err) {
      this.logSdkError('createOnboardingLink', err);
      throw new BadGatewayException(
        'The payout provider could not start onboarding. Please try again.',
      );
    }
  }

  async getAccountStatus(stripeAccountId: string): Promise<AccountStatusResult> {
    const stripe = await this.stripe();
    try {
      const account = await stripe.accounts.retrieve(stripeAccountId);
      return {
        detailsSubmitted: Boolean(account.details_submitted),
        payoutsEnabled: Boolean(account.payouts_enabled),
        raw: account as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logSdkError('getAccountStatus', err);
      throw new BadGatewayException('The payout provider could not return this account status.');
    }
  }

  /**
   * A Stripe Transfer to a connected account moves funds to that connected
   * account's Stripe balance immediately -- there is no granular pending
   * status the way Flutterwave's transfer polling has. The actual bank
   * payout happens later, via Stripe's own automatic payout schedule for
   * that connected account, which this call does not trigger and cannot
   * observe. Status is therefore modeled as 'transferred' on success, never
   * 'paid'/settled -- see mapStripeTransferStatus in wallet.controller.ts
   * for how that maps onto WithdrawalStatus.
   *
   * Idempotency key is deterministic (sha256 of the withdrawal's own
   * reference), not randomUUID() -- same reasoning as
   * FlutterwaveService.createTransfer: a retry of the SAME withdrawal
   * reuses the same key, so Stripe returns the original transfer instead of
   * creating a second real one if the first attempt actually landed.
   */
  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    const stripe = await this.stripe();
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: params.amountUsdCents,
          currency: 'usd',
          destination: params.stripeAccountId,
          transfer_group: params.reference,
          description: params.narration,
        },
        {
          idempotencyKey: createHash('sha256').update(`transfer:${params.reference}`).digest('hex'),
        },
      );
      return {
        transferId: transfer.id,
        status: 'transferred',
        raw: transfer as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logSdkError('createTransfer', err);
      throw new BadGatewayException(
        'The payout provider could not process this transfer. Please try again.',
      );
    }
  }

  /** PayoutProvider adapter. Maps a reversed transfer to a failed-ish status; otherwise the transfer is considered 'transferred' (see createTransfer's doc comment on what that does and doesn't mean). */
  async getPayoutStatus(transferId: string): Promise<ProviderPayoutStatus> {
    const stripe = await this.stripe();
    try {
      const transfer = await stripe.transfers.retrieve(transferId);
      const reversed = Boolean(transfer.reversed) || (transfer.amount_reversed ?? 0) > 0;
      return {
        payoutId: transfer.id,
        status: reversed ? 'reversed' : 'transferred',
        raw: transfer as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logSdkError('getPayoutStatus', err);
      throw new BadGatewayException('The payout provider could not return this transfer status.');
    }
  }

  /**
   * Wraps stripe.webhooks.constructEvent -- unlike FlutterwaveService's
   * hand-rolled HMAC compare, the SDK verifies the signature itself given
   * the raw body, the Stripe-Signature header, and the webhook secret.
   * Returns null (not a thrown error) on a failed/invalid signature so
   * callers can respond 401 the same way the Flutterwave webhook handler
   * does on a failed verifyWebhookSignature call.
   */
  async verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): Promise<Stripe.Event | null> {
    if (!signatureHeader) {
      return null;
    }
    try {
      const [stripe, webhookSecret] = await Promise.all([this.stripe(), this.webhookSecret()]);
      return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch (err) {
      this.logger.warn(
        `Stripe Connect webhook signature verification failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private logSdkError(callSite: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Stripe Connect ${callSite} failed: ${message}`);
  }
}
