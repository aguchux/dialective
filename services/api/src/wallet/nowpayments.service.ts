import {
  BadGatewayException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { PayoutProvider, ProviderPayoutStatus } from './payout-provider.interface';
import { getNowPaymentsCurrencyCode, type StablecoinNetwork } from './stablecoin-networks';

const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';
// createInvoice (deposits) is unchanged -- TRC20-only for now, tracked
// separately (see TokenomicsService.recordConfirmedNowPaymentsDepositTx).
// Only the payout side below is multi-network.
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
  network: StablecoinNetwork;
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
 * Carries NOWPayments' real HTTP status + response body alongside the
 * generic client-facing BadGatewayException message thrown from this
 * service. The controller's catch block persists providerDetail (not
 * err.message) into WithdrawalRequest.providerError/NowPaymentsPayoutEvent
 * so a failed payout is diagnosable straight from the DB -- previously
 * err.message was always this class's own generic string, and the real
 * upstream reason only ever reached this.logger.error, which rotates out
 * with the pod.
 */
export class NowPaymentsApiError extends BadGatewayException {
  readonly providerDetail: string;

  constructor(clientMessage: string, providerDetail: string) {
    super(clientMessage);
    this.providerDetail = providerDetail;
  }
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
      throw new NowPaymentsApiError(
        'The payment provider could not start checkout. Please try again.',
        `NOWPayments createInvoice ${res.status}: ${body}`,
      );
    }

    const json = (await res.json()) as { id: string; invoice_url: string };
    return { invoiceId: json.id, invoiceUrl: json.invoice_url };
  }

  /**
   * NOWPayments enforces a per-currency-per-network minimum payout amount
   * that moves with market conditions (confirmed with their support: not a
   * round or stable number, e.g. USDT-TRC20 sat at 10.98424792 on
   * 2026-09-09, while USDT-ERC20 was 0.41491074 the same day) -- hardcoding
   * a threshold would drift out of date. Checking this before createPayout
   * turns a NOWPayments 400 (BAD_CREATE_WITHDRAWAL_REQUEST, "min amount is
   * X") into an immediate, specific client-facing rejection instead of a
   * real API call that creates a payout row we'd then have to notice
   * failed and clean up.
   */
  async getPayoutMinAmount(currency: 'USDT' | 'USDC', network: StablecoinNetwork): Promise<number> {
    const providerCurrency = getNowPaymentsCurrencyCode(currency, network);
    const res = await fetch(
      `${NOWPAYMENTS_API_BASE}/payout-withdrawal/min-amount/${providerCurrency}`,
      { headers: { 'x-api-key': this.apiKey } },
    );
    const raw = await readNowPaymentsJson(res);
    if (!res.ok) {
      this.logger.error(`NOWPayments payout min-amount failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new NowPaymentsApiError(
        'The payout provider could not report its minimum withdrawal amount.',
        `NOWPayments payout-withdrawal/min-amount ${res.status}: ${JSON.stringify(raw)}`,
      );
    }
    const minAmount = Number(raw.min_amount ?? raw.minAmount ?? raw.amount);
    if (!Number.isFinite(minAmount) || minAmount <= 0) {
      throw new NowPaymentsApiError(
        'The payout provider returned an invalid minimum withdrawal amount.',
        `NOWPayments payout-withdrawal/min-amount missing amount: ${JSON.stringify(raw)}`,
      );
    }
    return minAmount;
  }

  async createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
    const minAmount = await this.getPayoutMinAmount(params.currency, params.network);
    if (params.amount < minAmount) {
      throw new UnprocessableEntityException(
        `This withdrawal is below the payout provider's current minimum of ${minAmount} ${params.currency} on ${params.network}. Ask the trainer to withdraw a larger amount.`,
      );
    }

    const token = await this.getPayoutAuthToken();
    const providerCurrency = getNowPaymentsCurrencyCode(params.currency, params.network);
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/payout`, {
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
      throw new NowPaymentsApiError(
        'The payout provider could not start this withdrawal. Please try again.',
        `NOWPayments createPayout ${res.status}: ${JSON.stringify(raw)}`,
      );
    }

    const payout = extractPayout(raw);
    if (!payout.id) {
      this.logger.error(
        `NOWPayments createPayout response did not include payout id: ${JSON.stringify(raw)}`,
      );
      throw new NowPaymentsApiError(
        'The payout provider returned an invalid payout response.',
        `NOWPayments createPayout missing id: ${JSON.stringify(raw)}`,
      );
    }

    return { payoutId: payout.id, status: payout.status, raw };
  }

  async verifyPayout(payoutId: string, verificationCode: string): Promise<PayoutStatusResult> {
    const token = await this.getPayoutAuthToken();
    const res = await fetch(
      `${NOWPAYMENTS_API_BASE}/payout/${encodeURIComponent(payoutId)}/verify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({ verification_code: verificationCode }),
      },
    );
    const raw = await readNowPaymentsJson(res);
    if (!res.ok) {
      this.logger.error(`NOWPayments verifyPayout failed: ${res.status} ${JSON.stringify(raw)}`);
      throw new NowPaymentsApiError(
        'The payout provider could not verify this payout.',
        `NOWPayments verifyPayout ${res.status}: ${JSON.stringify(raw)}`,
      );
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
      throw new NowPaymentsApiError(
        'The payout provider could not return payout status.',
        `NOWPayments getPayoutStatus ${res.status}: ${JSON.stringify(raw)}`,
      );
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
      throw new NowPaymentsApiError(
        'The payment provider could not return account balances.',
        `NOWPayments getBalance ${res.status}: ${JSON.stringify(raw)}`,
      );
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
      throw new NowPaymentsApiError(
        'The payout provider could not authenticate this payout request.',
        `NOWPayments auth ${res.status}: ${JSON.stringify(raw)}`,
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
  // GET /v1/payout/:id's real response nests the actual per-withdrawal
  // status inside withdrawals[0] (e.g. {id, createdAt, withdrawals:
  // [{batch_withdrawal_id, status: 'REJECTED', ...}]}) -- the top-level
  // object also has its own `id` (the batch id) but NO status field, so
  // withdrawals[0] must be checked BEFORE the bare top-level `raw`, or a
  // real rejected/failed payout is silently read back as status: null and
  // never reconciled (confirmed live 2026-09-09: four payouts NOWPayments
  // had already marked REJECTED stayed stuck at PROCESSING in our DB
  // because this order picked raw's id with no status instead).
  const candidates = [
    Array.isArray(raw.withdrawals)
      ? (raw.withdrawals[0] as Record<string, unknown> | undefined)
      : undefined,
    raw.payout as Record<string, unknown> | undefined,
    raw.result as Record<string, unknown> | undefined,
    raw,
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
