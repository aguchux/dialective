import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { PayoutProvider, ProviderPayoutStatus } from './payout-provider.interface';

const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_PAY_CURRENCIES = {
  USDC: 'usdc',
  USDT: 'usdttrc20',
} as const;

export interface CreateInvoiceParams {
  usdAmount: number;
  payCurrency: 'USDC' | 'USDT';
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceUrl: string;
}

export interface CreatePayoutParams {
  address: string;
  currency: 'USDT' | 'USDC';
  amount: number;
  withdrawalId: string;
}

export interface CreatePayoutResult {
  payoutId: string;
  status: string | null;
  raw: Record<string, unknown>;
}

export type PayoutStatusResult = ProviderPayoutStatus;

export interface ProviderBalance {
  currency: string;
  availableBalance: number;
  ledgerBalance: number;
}

/**
 * Thin wrapper around NOWPayments' hosted-invoice API -- same "one class
 * per external integration" shape as StorageService (Spaces) and
 * AsrRegistryService (models/asr-registry.yaml). Chosen over Coinbase
 * Commerce because Coinbase Commerce/Business does not onboard UK
 * merchants -- see AGENTS.md "Wallet / token pool" for why. We never touch
 * USDC/USDT private keys or wallet addresses directly (AGENTS.md's
 * guardrail against on-chain/custodial infrastructure) -- NOWPayments
 * hosts the checkout page and handles chain/address selection, and
 * notifies us via IPN webhook.
 */
@Injectable()
export class NowPaymentsService implements PayoutProvider {
  private readonly logger = new Logger(NowPaymentsService.name);

  private get apiKey(): string {
    const key = process.env.NOWPAYMENTS_API_KEY;
    if (!key) {
      throw new Error('NOWPAYMENTS_API_KEY is not set');
    }
    return key;
  }

  private get ipnSecret(): string {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!secret) {
      throw new Error('NOWPAYMENTS_IPN_SECRET is not set');
    }
    return secret;
  }

  private get payoutEmail(): string {
    const email = process.env.NOWPAYMENTS_PAYOUT_EMAIL;
    if (!email) {
      throw new Error('NOWPAYMENTS_PAYOUT_EMAIL is not set');
    }
    return email;
  }

  private get payoutPassword(): string {
    const password = process.env.NOWPAYMENTS_PAYOUT_PASSWORD;
    if (!password) {
      throw new Error('NOWPAYMENTS_PAYOUT_PASSWORD is not set');
    }
    return password;
  }

  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    // Do not create a payable invoice unless its eventual callback can be
    // authenticated. Reading the secret here deliberately fails fast.
    void this.ipnSecret;

    const res = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        price_amount: params.usdAmount,
        price_currency: 'usd',
        // NOWPayments exposes USDT per network rather than as a generic
        // merchant currency. TRC20 is enabled for this merchant and keeps
        // the trainer-facing choice as the simpler "USDT" label.
        pay_currency: NOWPAYMENTS_PAY_CURRENCIES[params.payCurrency],
        order_id: params.orderId,
        order_description: params.orderDescription,
        ipn_callback_url: params.ipnCallbackUrl,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`NOWPayments createInvoice failed: ${res.status} ${body}`);
      throw new BadGatewayException(
        'The payment provider could not start checkout. Please try again.',
      );
    }

    const json = (await res.json()) as { id: string; invoice_url: string };
    return { invoiceId: json.id, invoiceUrl: json.invoice_url };
  }

  async createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
    const token = await this.getPayoutAuthToken();
    const providerCurrency = NOWPAYMENTS_PAY_CURRENCIES[params.currency];
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/create/payout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        withdrawals: [
          {
            address: params.address,
            currency: providerCurrency,
            amount: Number(params.amount.toFixed(6)),
            unique_external_id: params.withdrawalId,
          },
        ],
      }),
    });

    const raw = await readNowPaymentsJson(res);
    if (!res.ok) {
      this.logger.error(`NOWPayments createPayout failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException(
        'The payout provider could not start this withdrawal. Please try again.',
      );
    }

    const payout = extractPayout(raw);
    if (!payout.id) {
      this.logger.error(
        `NOWPayments createPayout response did not include payout id: ${JSON.stringify(raw)}`,
      );
      throw new BadGatewayException('The payout provider returned an invalid payout response.');
    }

    return { payoutId: payout.id, status: payout.status, raw };
  }

  async verifyPayout(payoutId: string, verificationCode: string): Promise<PayoutStatusResult> {
    const token = await this.getPayoutAuthToken();
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/verify/payout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ payout_id: payoutId, verification_code: verificationCode }),
    });
    const raw = await readNowPaymentsJson(res);
    if (!res.ok) {
      this.logger.error(`NOWPayments verifyPayout failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider could not verify this payout.');
    }
    const payout = extractPayout(raw, payoutId);
    return { payoutId: payout.id ?? payoutId, status: payout.status, raw };
  }

  async getPayoutStatus(payoutId: string): Promise<PayoutStatusResult> {
    const token = await this.getPayoutAuthToken();
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/payout/${encodeURIComponent(payoutId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': this.apiKey,
      },
    });
    const raw = await readNowPaymentsJson(res);
    if (!res.ok) {
      this.logger.error(`NOWPayments getPayoutStatus failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payout provider could not return payout status.');
    }
    const payout = extractPayout(raw, payoutId);
    return { payoutId: payout.id ?? payoutId, status: payout.status, raw };
  }

  /**
   * GET /v1/balance -- this merchant account's balance per currency, used by
   * reserve-balance-poll.ts as the live source for TokenomicsService's
   * reserve total (see schema.prisma's ReserveBalanceSnapshot). Same simple
   * x-api-key read as createInvoice -- no payout-JWT auth needed for a
   * read-only balance call.
   */
  async getBalance(): Promise<ProviderBalance[]> {
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/balance`, {
      headers: { 'x-api-key': this.apiKey },
    });
    const raw = await readNowPaymentsJson(res);
    if (!res.ok) {
      this.logger.error(`NOWPayments getBalance failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException('The payment provider could not return account balances.');
    }
    // Historically shaped as { [currency]: { amount, pendingAmount } } --
    // tolerate either that map shape or an array-of-entries shape so a minor
    // API revision doesn't silently return an empty list.
    if (Array.isArray(raw)) {
      return raw.map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          currency: String(row.currency ?? '').toUpperCase(),
          availableBalance: Number(row.amount ?? row.balance ?? 0),
          ledgerBalance: Number(row.amount ?? row.balance ?? 0),
        };
      });
    }
    return Object.entries(raw).map(([currency, value]) => {
      const row = (value ?? {}) as Record<string, unknown>;
      const available = Number(row.amount ?? 0);
      return {
        currency: currency.toUpperCase(),
        availableBalance: available,
        ledgerBalance: available + Number(row.pendingAmount ?? 0),
      };
    });
  }

  private async getPayoutAuthToken(): Promise<string> {
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ email: this.payoutEmail, password: this.payoutPassword }),
    });
    const raw = await readNowPaymentsJson(res);
    if (!res.ok || typeof raw.token !== 'string') {
      this.logger.error(`NOWPayments payout auth failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new BadGatewayException(
        'The payout provider could not authenticate this payout request.',
      );
    }
    return raw.token;
  }

  /**
   * NOWPayments signs IPN callbacks with HMAC-SHA512, but NOT over the raw
   * request bytes -- it's over JSON.stringify() of the parsed body with all
   * object keys recursively sorted alphabetically. This means (unlike
   * Coinbase Commerce, which required preserving the exact raw bytes ahead
   * of Nest's body parser -- see AGENTS.md for the bug that caused) we can
   * verify against Nest's already-parsed body, no raw-body middleware
   * needed. Re-serializing must exactly match NOWPayments' own sorting or
   * every signature will mismatch -- see sortKeysDeep below.
   */
  verifyIpnSignature(parsedBody: unknown, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) {
      return false;
    }
    const sorted = JSON.stringify(sortKeysDeep(parsedBody));
    const expected = createHmac('sha512', this.ipnSecret).update(sorted).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signatureHeader, 'hex');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  getIpnEventHash(parsedBody: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(sortKeysDeep(parsedBody)))
      .digest('hex');
  }
}

async function readNowPaymentsJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function extractPayout(
  raw: Record<string, unknown>,
  fallbackId?: string,
): { id: string | null; status: string | null } {
  const candidates = [
    raw,
    raw.payout as Record<string, unknown> | undefined,
    raw.result as Record<string, unknown> | undefined,
    Array.isArray(raw.withdrawals)
      ? (raw.withdrawals[0] as Record<string, unknown> | undefined)
      : undefined,
  ].filter(Boolean) as Record<string, unknown>[];

  for (const candidate of candidates) {
    const id =
      candidate.id ??
      candidate.payout_id ??
      candidate.batch_withdrawal_id ??
      candidate.withdrawal_id;
    const status = candidate.status ?? candidate.payout_status ?? candidate.withdrawal_status;
    if (typeof id === 'string' || typeof id === 'number') {
      return { id: String(id), status: typeof status === 'string' ? status : null };
    }
  }

  return { id: fallbackId ?? null, status: typeof raw.status === 'string' ? raw.status : null };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}
