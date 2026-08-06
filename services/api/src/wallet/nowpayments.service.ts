import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';

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
export class NowPaymentsService {
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

  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    const res = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        price_amount: params.usdAmount,
        price_currency: 'usd',
        pay_currency: params.payCurrency.toLowerCase(),
        order_id: params.orderId,
        order_description: params.orderDescription,
        ipn_callback_url: params.ipnCallbackUrl,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`NOWPayments createInvoice failed: ${res.status} ${body}`);
      throw new Error('Failed to create NOWPayments invoice');
    }

    const json = (await res.json()) as { id: string; invoice_url: string };
    return { invoiceId: json.id, invoiceUrl: json.invoice_url };
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
