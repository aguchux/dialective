import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const COMMERCE_API_BASE = 'https://api.commerce.coinbase.com';
const COMMERCE_API_VERSION = '2018-03-22';

export interface CreateChargeParams {
  name: string;
  description: string;
  usdAmount: number;
  metadata: Record<string, string>;
}

export interface CreateChargeResult {
  chargeId: string;
  hostedUrl: string;
}

/**
 * Thin wrapper around Coinbase Commerce's hosted-checkout API -- same
 * "one class per external integration" shape as StorageService (Spaces) and
 * AsrRegistryService (models/asr-registry.yaml). We never touch USDC/USDT
 * private keys or wallet addresses directly (AGENTS.md's guardrail against
 * on-chain/custodial infrastructure) -- Coinbase hosts the checkout page and
 * handles chain/address selection, and notifies us via webhook.
 */
@Injectable()
export class CoinbaseCommerceService {
  private readonly logger = new Logger(CoinbaseCommerceService.name);

  private get apiKey(): string {
    const key = process.env.COINBASE_COMMERCE_API_KEY;
    if (!key) {
      throw new Error('COINBASE_COMMERCE_API_KEY is not set');
    }
    return key;
  }

  private get webhookSecret(): string {
    const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('COINBASE_COMMERCE_WEBHOOK_SECRET is not set');
    }
    return secret;
  }

  async createCharge(params: CreateChargeParams): Promise<CreateChargeResult> {
    const res = await fetch(`${COMMERCE_API_BASE}/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': this.apiKey,
        'X-CC-Version': COMMERCE_API_VERSION,
      },
      body: JSON.stringify({
        name: params.name,
        description: params.description,
        pricing_type: 'fixed_price',
        local_price: { amount: params.usdAmount.toFixed(2), currency: 'USD' },
        metadata: params.metadata,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Coinbase Commerce createCharge failed: ${res.status} ${body}`);
      throw new Error('Failed to create Coinbase Commerce charge');
    }

    const json = (await res.json()) as { data: { id: string; hosted_url: string } };
    return { chargeId: json.data.id, hostedUrl: json.data.hosted_url };
  }

  /**
   * Coinbase signs each webhook body with HMAC-SHA256 over the raw request
   * bytes (X-CC-Webhook-Signature header) -- must be verified against the
   * exact bytes received, before any JSON parsing, or a forged webhook could
   * credit arbitrary deposits. See main.ts for how the raw body is preserved
   * for this route specifically.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) {
      return false;
    }
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signatureHeader, 'hex');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
