import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { PayoutProvider, ProviderPayoutStatus } from './payout-provider.interface';

const FLUTTERWAVE_API_BASE = 'https://api.flutterwave.com/v3';

export interface CreatePaymentParams {
  amount: number;
  currency: string;
  txRef: string;
  redirectUrl: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  paymentOptions?: string;
}

export interface CreatePaymentResult {
  link: string;
}

export interface VerifyPaymentResult {
  flutterwaveTxId: string;
  txRef: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  raw: Record<string, unknown>;
}

export interface CreateTransferParams {
  accountBank: string;
  accountNumber: string;
  amount: number;
  currency: string;
  narration: string;
  reference: string;
  beneficiaryName?: string;
}

export interface TransferResult {
  transferId: string;
  status: string | null;
  raw: Record<string, unknown>;
}

export interface BankOption {
  code: string;
  name: string;
}

export interface ResolveAccountResult {
  accountNumber: string;
  accountName: string;
}

export interface ProviderBalance {
  currency: string;
  availableBalance: number;
  ledgerBalance: number;
}

/**
 * Thin wrapper around Flutterwave's v3 API -- the fiat (bank transfer +
 * mobile money) rail alongside NowPaymentsService's stablecoin rail. Same
 * "one class per external integration" shape: no constructor DI, env vars
 * read lazily via getters that fail fast on first use, typed results never
 * leak raw provider JSON to callers, every failure is logged server-side and
 * surfaced as a generic BadGatewayException.
 */
@Injectable()
export class FlutterwaveService implements PayoutProvider {
  private readonly logger = new Logger(FlutterwaveService.name);

  private get secretKey(): string {
    const key = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!key) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not set');
    }
    return key;
  }

  private get webhookSecretHash(): string {
    const hash = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
    if (!hash) {
      throw new Error('FLUTTERWAVE_WEBHOOK_SECRET_HASH is not set');
    }
    return hash;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/payments`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        tx_ref: params.txRef,
        amount: params.amount,
        currency: params.currency,
        redirect_url: params.redirectUrl,
        payment_options: params.paymentOptions ?? 'card,mobilemoney,ussd,banktransfer',
        customer: {
          email: params.customerEmail,
          name: params.customerName,
          phone_number: params.customerPhone,
        },
      }),
    });

    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave createPayment failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException(
        'The payment provider could not start checkout. Please try again.',
      );
    }

    const link = (raw.data as Record<string, unknown> | undefined)?.link;
    if (typeof link !== 'string') {
      this.logger.error(
        `Flutterwave createPayment response did not include a checkout link: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payment provider returned an invalid checkout response.');
    }
    return { link };
  }

  async verifyPaymentById(flutterwaveTxId: string): Promise<VerifyPaymentResult> {
    const res = await fetch(
      `${FLUTTERWAVE_API_BASE}/transactions/${encodeURIComponent(flutterwaveTxId)}/verify`,
      { method: 'GET', headers: this.authHeaders() },
    );
    return this.parseVerifyPaymentResponse(res, flutterwaveTxId);
  }

  async verifyPaymentByReference(txRef: string): Promise<VerifyPaymentResult> {
    const res = await fetch(
      `${FLUTTERWAVE_API_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
      { method: 'GET', headers: this.authHeaders() },
    );
    return this.parseVerifyPaymentResponse(res);
  }

  private async parseVerifyPaymentResponse(
    res: Response,
    fallbackTxId?: string,
  ): Promise<VerifyPaymentResult> {
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave verify payment failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider could not verify this payment.');
    }
    const data = raw.data as Record<string, unknown> | undefined;
    return {
      flutterwaveTxId: String(data?.id ?? fallbackTxId ?? ''),
      txRef: typeof data?.tx_ref === 'string' ? data.tx_ref : null,
      status: typeof data?.status === 'string' ? data.status : null,
      amount: typeof data?.amount === 'number' ? data.amount : null,
      currency: typeof data?.currency === 'string' ? data.currency : null,
      raw,
    };
  }

  async listBanks(country: string): Promise<BankOption[]> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/banks/${encodeURIComponent(country)}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave listBanks failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider could not list banks for this country.');
    }
    const data = Array.isArray(raw.data) ? (raw.data as Record<string, unknown>[]) : [];
    return data
      .map((bank) => ({ code: String(bank.code ?? ''), name: String(bank.name ?? '') }))
      .filter((bank) => bank.code && bank.name);
  }

  /**
   * Resolves a bank account number to its registered holder name -- used
   * both when a trainer adds a bank PayoutAccount and defensively again
   * immediately before every payout submission (bank details can go stale
   * between snapshot and submit time). Path/response shape confirmed
   * against sandbox before Stage 3 ships; isolated here so it can be
   * corrected in one place if the assumed shape is wrong.
   */
  async resolveAccount(params: {
    accountBank: string;
    accountNumber: string;
  }): Promise<ResolveAccountResult> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/accounts/resolve`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        account_bank: params.accountBank,
        account_number: params.accountNumber,
      }),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave resolveAccount failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException(
        'The payout provider could not resolve this account. Double-check the account number and bank.',
      );
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const accountNumber = data?.account_number;
    const accountName = data?.account_name;
    if (typeof accountNumber !== 'string' || typeof accountName !== 'string') {
      this.logger.error(
        `Flutterwave resolveAccount response missing account details: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payout provider returned an invalid account response.');
    }
    return { accountNumber, accountName };
  }

  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/transfers`, {
      method: 'POST',
      // Deterministic, not randomUUID() -- derived from the withdrawal's own
      // id (params.reference) so a retry of the SAME withdrawal reuses the
      // same idempotency key, letting Flutterwave return the original
      // transfer instead of creating a second real payout if the first
      // attempt actually landed on their side.
      headers: {
        ...this.authHeaders(),
        'X-Idempotency-Key': createHash('sha256')
          .update(`transfer:${params.reference}`)
          .digest('hex'),
      },
      body: JSON.stringify({
        account_bank: params.accountBank,
        account_number: params.accountNumber,
        amount: params.amount,
        currency: params.currency,
        narration: params.narration,
        reference: params.reference,
        beneficiary_name: params.beneficiaryName,
      }),
    });
    return this.parseTransferResponse(res, 'createTransfer');
  }

  async getTransferStatus(transferId: string): Promise<TransferResult> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/transfers/${encodeURIComponent(transferId)}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    return this.parseTransferResponse(res, 'getTransferStatus', transferId);
  }

  /** PayoutProvider adapter -- Flutterwave's own vocabulary is "transfer", not "payout". */
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
      this.logger.error(`Flutterwave ${callSite} failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException(
        'The payout provider could not process this transfer. Please try again.',
      );
    }
    const data = raw.data as Record<string, unknown> | undefined;
    const id = data?.id;
    if (typeof id !== 'string' && typeof id !== 'number' && !fallbackId) {
      this.logger.error(
        `Flutterwave ${callSite} response did not include a transfer id: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payout provider returned an invalid transfer response.');
    }
    return {
      transferId: id !== undefined ? String(id) : (fallbackId as string),
      status: typeof data?.status === 'string' ? data.status : null,
      raw,
    };
  }

  /**
   * Flutterwave's documentation is inconsistent across versions about which
   * header/algorithm carries the webhook signature: legacy docs describe a
   * `verif-hash` header (plain string compare against the dashboard secret
   * hash), newer docs describe a `flutterwave-signature` header (HMAC-SHA256
   * of the raw request body, base64, keyed by the same secret hash). Rather
   * than guess which one the account actually sends, accept either -- this
   * requires the RAW request body bytes for the HMAC path (unlike
   * NOWPayments' sorted-parsed-JSON HMAC, Flutterwave's is documented as
   * being over raw bytes), so callers must capture the raw body ahead of
   * Nest's body parser for this route specifically.
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | undefined>): boolean {
    const legacyHash = headers['verif-hash'];
    if (legacyHash && timingSafeCompareStrings(legacyHash, this.webhookSecretHash)) {
      return true;
    }

    const hmacSignature = headers['flutterwave-signature'];
    if (hmacSignature) {
      const expected = createHmac('sha256', this.webhookSecretHash)
        .update(rawBody)
        .digest('base64');
      const expectedBuf = Buffer.from(expected, 'base64');
      const actualBuf = Buffer.from(hmacSignature, 'base64');
      if (expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)) {
        return true;
      }
    }

    return false;
  }

  getWebhookEventHash(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  /**
   * GET /v3/balances -- every currency balance held in this Flutterwave
   * merchant account, used by reserve-balance-poll.ts as the live source
   * for TokenomicsService's reserve total (see schema.prisma's
   * ReserveBalanceSnapshot). Same bearer-secret-key auth as every other v3
   * call here; no v4 equivalent is used since v4 has no confirmed balances
   * resource.
   */
  async listBalances(): Promise<ProviderBalance[]> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/balances`, {
      headers: this.authHeaders(),
    });
    const raw = await readFlutterwaveJson(res);
    if (!res.ok) {
      this.logger.error(`Flutterwave listBalances failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider could not return account balances.');
    }
    const data = raw.data;
    if (!Array.isArray(data)) {
      this.logger.error(
        `Flutterwave listBalances returned an unexpected shape: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payment provider returned an invalid balances response.');
    }
    return data.map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        currency: String(row.currency ?? ''),
        availableBalance: Number(row.available_balance ?? 0),
        ledgerBalance: Number(row.ledger_balance ?? 0),
      };
    });
  }
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
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
