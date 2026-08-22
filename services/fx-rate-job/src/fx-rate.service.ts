import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

const FX_API_URL = process.env.FX_API_URL ?? 'https://open.er-api.com/v6/latest/USD';

export interface FxRatesResponse {
  result: string;
  rates: Record<string, number>;
}

/** Narrow, defensive parse -- never trust an external API's shape blindly. */
export function parseFxRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') throw new Error('FX API response was not an object');
  const body = raw as Partial<FxRatesResponse>;
  if (body.result !== 'success' || !body.rates || typeof body.rates !== 'object') {
    throw new Error('FX API response missing a successful rates payload');
  }
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(body.rates)) {
    if (typeof value === 'number' && value > 0) {
      rates[code] = value;
    }
  }
  return rates;
}

/**
 * One-shot job (mirrors settlement-job/word-generator-job's application-
 * context template): fetches live USD-base FX rates and writes
 * Country.usdExchangeRate for every country still on exchangeRateSource
 * 'LIVE'. Countries an admin has manually overridden ('MANUAL') are left
 * untouched until reset back to 'LIVE' via the admin UI. On any fetch
 * failure, no rows are touched -- a stale-but-correct rate is safer than a
 * null/wiped one, and the failure is surfaced via the job's exit code for
 * whatever external scheduler runs this.
 */
@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<void> {
    const countries = await this.prisma.country.findMany({
      where: { exchangeRateSource: 'LIVE' },
      select: { id: true, currencyCode: true },
    });
    if (countries.length === 0) {
      this.logger.log('No LIVE-source countries to update; skipping fetch');
      return;
    }

    const res = await fetch(FX_API_URL);
    if (!res.ok) {
      throw new Error(`FX API request failed: ${res.status} ${res.statusText}`);
    }
    const rates = parseFxRates(await res.json());

    const now = new Date();
    let updated = 0;
    let skipped = 0;
    for (const country of countries) {
      const rate = country.currencyCode === 'USD' ? 1 : rates[country.currencyCode];
      if (rate === undefined) {
        skipped += 1;
        continue;
      }
      await this.prisma.country.update({
        where: { id: country.id },
        data: { usdExchangeRate: rate, exchangeRateUpdatedAt: now },
      });
      updated += 1;
    }
    this.logger.log(
      `fx-rate-job: updated ${updated} countries, skipped ${skipped} (currency not in FX API response)`,
    );
  }
}
