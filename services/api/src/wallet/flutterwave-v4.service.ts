import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { PayoutProvider, ProviderPayoutStatus } from './payout-provider.interface';

const TOKEN_URL =
  'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';
const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh ~1 min before expiry, per Flutterwave's own guidance

export interface CreateCustomerParams {
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export interface CreateVirtualAccountParams {
  customerId: string;
  amount: number;
  currency: string;
  bankCode?: string;
  reference: string;
  narration: string;
}

export interface VirtualAccountResult {
  accountNumber: string;
  bankName: string;
  note: string | null;
}

export interface CreateMobileMoneyChargeParams {
  customerId: string;
  network: string;
  countryCode: string;
  phoneNumber: string;
  amount: number;
  currency: string;
  reference: string;
  redirectUrl: string;
}

export interface MobileMoneyChargeResult {
  chargeId: string;
  redirectUrl: string | null;
}

export interface ChargeResult {
  chargeId: string;
  status: 'succeeded' | 'pending' | 'failed' | 'voided' | null;
  amount: number | null;
  currency: string | null;
  raw: Record<string, unknown>;
}

export type RecipientCountry = 'NG' | 'GH' | 'KE' | 'UG' | 'ZA' | 'TZ';

export interface CreateBankRecipientParams {
  type: 'bank';
  country: RecipientCountry;
  bankCode: string;
  accountNumber: string;
}

export interface CreateMobileMoneyRecipientParams {
  type: 'mobile_money';
  country: RecipientCountry;
  network: string;
  phoneNumber: string;
}

export type CreateRecipientParams = CreateBankRecipientParams | CreateMobileMoneyRecipientParams;

export interface RecipientResult {
  recipientId: string;
}

export interface SenderResult {
  senderId: string;
}

export interface CreateTransferParams {
  recipientId: string;
  senderId: string;
  amount: number;
  currency: string;
  reference: string;
  narration: string;
}

export interface TransferResult {
  transferId: string;
  status: string | null;
  raw: Record<string, unknown>;
}

/**
 * Bank recipient type per currently-supported country, per Flutterwave's
 * v4 /transfers/recipients "type" enum (confirmed against their reference
 * docs: bank_ngn, bank_ghs, bank_kes, bank_zar, bank_ugx exist; no bank_tzs
 * was found -- Tanzania bank payouts are not supported under v4 today).
 */
const BANK_RECIPIENT_TYPE: Record<RecipientCountry, string | null> = {
  NG: 'bank_ngn',
  GH: 'bank_ghs',
  KE: 'bank_kes',
  UG: 'bank_ugx',
  ZA: 'bank_zar',
  TZ: null,
};

/**
 * Mobile money recipient type per currently-supported country. No mobile-
 * money recipient type was found for Nigeria or South Africa in Flutterwave's
 * docs -- those markets are bank-only under v4's recipient model.
 */
const MOBILE_MONEY_RECIPIENT_TYPE: Record<RecipientCountry, string | null> = {
  NG: null,
  GH: 'mobile_money_ghs',
  KE: 'mobile_money_kes',
  UG: 'mobile_money_ugx',
  ZA: null,
  TZ: 'mobile_money_tzs',
};

/**
 * Flutterwave's current (v4) API -- OAuth2 client-credentials auth, Customer
 * + PaymentMethod + Charge for funding, Recipient + Sender + Transfer for
 * payouts. Deliberately a separate class from FlutterwaveService (v3), not
 * a rewrite of it: v3 stays untouched as the always-available fallback
 * behind PlatformSettings.isFlutterwaveV4Enabled, matching the "one class
 * per integration/version" precedent NowPaymentsService/FlutterwaveService
 * already set. Card payments are intentionally unsupported here -- v4 card
 * charges require field-level encryption keyed by this app's own dashboard
 * secret, which would mean raw card numbers transiting this backend before
 * encryption (a materially worse PCI posture than v3's fully-hosted-page
 * flow, where card data never reaches this backend at all). Bank transfer
 * (virtual account) and mobile money are the only v4 funding methods.
 */
@Injectable()
export class FlutterwaveV4Service implements PayoutProvider {
  private readonly logger = new Logger(FlutterwaveV4Service.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private get clientId(): string {
    const value = process.env.FLUTTERWAVE_V4_CLIENT_ID;
    if (!value) throw new Error('FLUTTERWAVE_V4_CLIENT_ID is not set');
    return value;
  }

  private get clientSecret(): string {
    const value = process.env.FLUTTERWAVE_V4_CLIENT_SECRET;
    if (!value) throw new Error('FLUTTERWAVE_V4_CLIENT_SECRET is not set');
    return value;
  }

  private get baseUrl(): string {
    const value = process.env.FLUTTERWAVE_V4_BASE_URL;
    if (!value) throw new Error('FLUTTERWAVE_V4_BASE_URL is not set');
    return value;
  }

  private get webhookSecretHash(): string {
    const value = process.env.FLUTTERWAVE_V4_WEBHOOK_SECRET_HASH;
    if (!value) throw new Error('FLUTTERWAVE_V4_WEBHOOK_SECRET_HASH is not set');
    return value;
  }

  /**
   * v4 tokens expire every 10 minutes. Cached in-memory on this instance
   * (no shared/Redis cache -- each pod exchanges its own token, refreshed
   * lazily ~1 min before expiry) rather than re-exchanged on every call.
   */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave v4 token exchange failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider could not authenticate this request.');
    }
    const accessToken = raw.access_token;
    const expiresIn = raw.expires_in;
    if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
      this.logger.error(`Flutterwave v4 token response missing fields: ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider returned an invalid auth response.');
    }
    this.cachedToken = accessToken;
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;
    return accessToken;
  }

  private async authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Trace-Id': randomUUID(),
      ...extra,
    };
  }

  async createCustomer(params: CreateCustomerParams): Promise<{ customerId: string }> {
    const res = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: await this.authHeaders({ 'X-Idempotency-Key': randomUUID() }),
      body: JSON.stringify({
        email: params.email,
        ...(params.firstName || params.lastName
          ? { name: { first: params.firstName, last: params.lastName } }
          : {}),
        ...(params.phoneNumber ? { phone: toPhoneObject(params.phoneNumber) } : {}),
      }),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave v4 createCustomer failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider could not create a customer record.');
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const customerId = data?.id;
    if (typeof customerId !== 'string') {
      this.logger.error(`Flutterwave v4 createCustomer response missing id: ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider returned an invalid customer response.');
    }
    return { customerId };
  }

  async createVirtualAccount(params: CreateVirtualAccountParams): Promise<VirtualAccountResult> {
    const res = await fetch(`${this.baseUrl}/virtual-accounts`, {
      method: 'POST',
      headers: await this.authHeaders({ 'X-Idempotency-Key': randomUUID() }),
      body: JSON.stringify({
        reference: params.reference,
        customer_id: params.customerId,
        amount: params.amount,
        currency: params.currency,
        bank_code: params.bankCode,
        account_type: 'dynamic',
        narration: params.narration,
      }),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(
        `Flutterwave v4 createVirtualAccount failed: ${res.status} ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException(
        'The payment provider could not generate a bank transfer account.',
      );
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const accountNumber = data?.account_number;
    const bankName = data?.account_bank_name;
    if (typeof accountNumber !== 'string' || typeof bankName !== 'string') {
      this.logger.error(
        `Flutterwave v4 createVirtualAccount response missing fields: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payment provider returned an invalid account response.');
    }
    return {
      accountNumber,
      bankName,
      note: typeof data?.note === 'string' ? data.note : null,
    };
  }

  async createMobileMoneyCharge(
    params: CreateMobileMoneyChargeParams,
  ): Promise<MobileMoneyChargeResult> {
    const methodRes = await fetch(`${this.baseUrl}/payment-methods`, {
      method: 'POST',
      headers: await this.authHeaders({ 'X-Idempotency-Key': randomUUID() }),
      body: JSON.stringify({
        type: 'mobile_money',
        customer_id: params.customerId,
        mobile_money: {
          network: params.network,
          country_code: params.countryCode,
          phone_number: params.phoneNumber,
        },
      }),
    });
    const methodRaw = await readFlutterwaveJson(methodRes);
    if (!methodRes.ok) {
      this.logger.error(
        `Flutterwave v4 create mobile money payment-method failed: ${methodRes.status} ${JSON.stringify(methodRaw)}`,
      );
      throw new BadGatewayException('The payment provider could not register this mobile number.');
    }
    const methodData = methodRaw.data as Record<string, unknown> | undefined;
    const paymentMethodId = methodData?.id;
    if (typeof paymentMethodId !== 'string') {
      this.logger.error(
        `Flutterwave v4 payment-method response missing id: ${JSON.stringify(methodRaw)}`,
      );
      throw new BadGatewayException('The payment provider returned an invalid payment method.');
    }

    const chargeRes = await fetch(`${this.baseUrl}/charges`, {
      method: 'POST',
      headers: await this.authHeaders({
        'X-Idempotency-Key': randomUUID(),
        'X-Scenario-Key': 'scenario:auth_redirect',
      }),
      body: JSON.stringify({
        currency: params.currency,
        customer_id: params.customerId,
        payment_method_id: paymentMethodId,
        amount: params.amount,
        reference: params.reference,
        redirect_url: params.redirectUrl,
      }),
    });
    const chargeRaw = await readFlutterwaveJson(chargeRes);
    if (!chargeRes.ok) {
      this.logger.error(
        `Flutterwave v4 createMobileMoneyCharge failed: ${chargeRes.status} ${JSON.stringify(chargeRaw)}`,
      );
      throw new BadGatewayException('The payment provider could not start this charge.');
    }
    const chargeData = chargeRaw.data as Record<string, unknown> | undefined;
    const chargeId = chargeData?.id;
    if (typeof chargeId !== 'string') {
      this.logger.error(`Flutterwave v4 charge response missing id: ${JSON.stringify(chargeRaw)}`);
      throw new BadGatewayException('The payment provider returned an invalid charge response.');
    }
    const nextAction = chargeData?.next_action as Record<string, unknown> | undefined;
    const redirectUrlObj = nextAction?.redirect_url as Record<string, unknown> | undefined;
    const redirectUrl = redirectUrlObj?.url;
    return { chargeId, redirectUrl: typeof redirectUrl === 'string' ? redirectUrl : null };
  }

  async getCharge(chargeId: string): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl}/charges/${encodeURIComponent(chargeId)}`, {
      method: 'GET',
      headers: await this.authHeaders(),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave v4 getCharge failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider could not retrieve this charge.');
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const status = data?.status;
    return {
      chargeId,
      status: isChargeStatus(status) ? status : null,
      amount: typeof data?.amount === 'number' ? data.amount : null,
      currency: typeof data?.currency === 'string' ? data.currency : null,
      raw,
    };
  }

  /** Dispatches on country + type per BANK_RECIPIENT_TYPE/MOBILE_MONEY_RECIPIENT_TYPE -- throws a clear error for an unmapped combination rather than guessing a type string. */
  async createRecipient(params: CreateRecipientParams): Promise<RecipientResult> {
    const body =
      params.type === 'bank'
        ? {
            type: requireRecipientType(BANK_RECIPIENT_TYPE, params.country, 'bank'),
            bank: { account_number: params.accountNumber, code: params.bankCode },
          }
        : {
            type: requireRecipientType(MOBILE_MONEY_RECIPIENT_TYPE, params.country, 'mobile money'),
            mobile_money: { network: params.network, msisdn: params.phoneNumber },
          };
    const res = await fetch(`${this.baseUrl}/transfers/recipients`, {
      method: 'POST',
      headers: await this.authHeaders({ 'X-Idempotency-Key': randomUUID() }),
      body: JSON.stringify(body),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave v4 createRecipient failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider could not register this recipient.');
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const recipientId = data?.id;
    if (typeof recipientId !== 'string') {
      this.logger.error(`Flutterwave v4 recipient response missing id: ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider returned an invalid recipient response.');
    }
    return { recipientId };
  }

  /**
   * One-time, platform-level sender identity (not per-trainer) -- callers
   * should create this once and persist the id (see wallet.controller.ts's
   * lazy-fetch-or-create against a cached PlatformSettings field) rather
   * than calling this on every withdrawal.
   */
  async createSender(): Promise<SenderResult> {
    const res = await fetch(`${this.baseUrl}/transfers/senders`, {
      method: 'POST',
      headers: await this.authHeaders({ 'X-Idempotency-Key': randomUUID() }),
      body: JSON.stringify({ type: 'generic_sender' }),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave v4 createSender failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider could not register a sender identity.');
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const senderId = data?.id;
    if (typeof senderId !== 'string') {
      this.logger.error(`Flutterwave v4 sender response missing id: ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider returned an invalid sender response.');
    }
    return { senderId };
  }

  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    const res = await fetch(`${this.baseUrl}/transfers`, {
      method: 'POST',
      headers: await this.authHeaders({ 'X-Idempotency-Key': randomUUID() }),
      body: JSON.stringify({
        action: 'instant',
        reference: params.reference,
        narration: params.narration,
        payment_instruction: {
          source_currency: params.currency,
          amount: { value: params.amount, applies_to: 'destination_currency' },
          recipient_id: params.recipientId,
          sender_id: params.senderId,
        },
      }),
    });
    return this.parseTransferResponse(res, 'createTransfer');
  }

  async getTransferStatus(transferId: string): Promise<TransferResult> {
    const res = await fetch(`${this.baseUrl}/transfers/${encodeURIComponent(transferId)}`, {
      method: 'GET',
      headers: await this.authHeaders(),
    });
    return this.parseTransferResponse(res, 'getTransferStatus', transferId);
  }

  /** PayoutProvider adapter -- same shape as FlutterwaveService's v3 adapter. */
  async getPayoutStatus(transferId: string): Promise<ProviderPayoutStatus> {
    const { transferId: payoutId, status, raw } = await this.getTransferStatus(transferId);
    return { payoutId, status, raw };
  }

  private async parseTransferResponse(
    res: Response,
    callSite: string,
    fallbackId?: string,
  ): Promise<TransferResult> {
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave v4 ${callSite} failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException(
        'The payout provider could not process this transfer. Please try again.',
      );
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const id = data?.id;
    if (typeof id !== 'string' && !fallbackId) {
      this.logger.error(
        `Flutterwave v4 ${callSite} response did not include a transfer id: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payout provider returned an invalid transfer response.');
    }
    return {
      transferId: typeof id === 'string' ? id : (fallbackId as string),
      status: typeof data?.status === 'string' ? data.status : null,
      raw,
    };
  }

  /**
   * v4 only documents the flutterwave-signature header (HMAC-SHA256 over
   * raw body, base64) -- v3's legacy verif-hash fallback doesn't apply here.
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | undefined>): boolean {
    const hmacSignature = headers['flutterwave-signature'];
    if (!hmacSignature) return false;
    const expected = createHmac('sha256', this.webhookSecretHash).update(rawBody).digest('base64');
    const expectedBuf = Buffer.from(expected, 'base64');
    const actualBuf = Buffer.from(hmacSignature, 'base64');
    return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  }

  getWebhookEventHash(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }
}

function requireRecipientType(
  table: Record<RecipientCountry, string | null>,
  country: RecipientCountry,
  kind: string,
): string {
  const type = table[country];
  if (!type) {
    throw new BadGatewayException(
      `Flutterwave v4 does not support ${kind} payouts for ${country} yet.`,
    );
  }
  return type;
}

function toPhoneObject(phoneNumber: string): { country_code: string; number: string } {
  // E.164 (+2348012345678) -- best-effort split; Flutterwave's phone object
  // wants country_code and number separately, but accepts a best-effort
  // split since it re-validates server-side regardless.
  const match = /^\+(\d{1,3})(\d+)$/.exec(phoneNumber);
  if (!match) return { country_code: '', number: phoneNumber };
  return { country_code: match[1], number: match[2] };
}

function isChargeStatus(
  value: unknown,
): value is 'succeeded' | 'pending' | 'failed' | 'voided' {
  return value === 'succeeded' || value === 'pending' || value === 'failed' || value === 'voided';
}

async function readFlutterwaveJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}
