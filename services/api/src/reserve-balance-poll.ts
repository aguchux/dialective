import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@dialectiva/db';
import { AppModule } from './app.module';
import { FlutterwaveService } from './wallet/flutterwave.service';
import { NowPaymentsService, ProviderBalance } from './wallet/nowpayments.service';
import { PrismaService } from './prisma/prisma.service';

const STABLECOIN_CURRENCIES = new Set(['USDT', 'USDC', 'USD']);

/**
 * One-shot entrypoint for the reserve-balance-poll k8s CronJob (every 15
 * minutes). Pulls live account balances from Flutterwave (GET /v3/balances)
 * and NOWPayments (GET /v1/balance), converts each to USD, and upserts
 * ReserveBalanceSnapshot -- the live source TokenomicsService.getStatus now
 * sums as the reserve total (replacing the old ReserveTransaction-ledger
 * sum). A failed provider call leaves its existing cached rows untouched
 * rather than clearing them or failing the whole run -- this IS the
 * fallback-to-last-known-good behavior: getStatus always reads whatever is
 * currently cached, stale or fresh, and reserveBalancesFetchedAt on the
 * admin Tokenomics page surfaces how stale it is.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const flutterwave = app.get(FlutterwaveService);
  const nowPayments = app.get(NowPaymentsService);
  const prisma = app.get(PrismaService);

  const results: { provider: string; currency: string; balanceUsd: number }[] = [];
  const errors: { provider: string; message: string }[] = [];

  try {
    await pollFlutterwave(flutterwave, prisma, results, errors);
    await pollNowPayments(nowPayments, prisma, results, errors);

    // eslint-disable-next-line no-console
    console.log('reserve balance poll complete', { results, errors });
    await app.close();
    process.exit(0);
  } catch (err) {
    await app.close();
    // eslint-disable-next-line no-console
    console.error('reserve balance poll failed unexpectedly', err);
    process.exit(1);
  }
}

async function pollFlutterwave(
  flutterwave: FlutterwaveService,
  prisma: PrismaService,
  results: { provider: string; currency: string; balanceUsd: number }[],
  errors: { provider: string; message: string }[],
) {
  let balances: ProviderBalance[];
  try {
    balances = await flutterwave.listBalances();
  } catch (err) {
    errors.push({ provider: 'flutterwave', message: (err as Error).message });
    return;
  }

  for (const balance of balances) {
    try {
      const currency = balance.currency.toUpperCase();
      const balanceUsd = await toUsd(prisma, currency, balance.availableBalance);
      if (balanceUsd === null) continue;
      await upsertSnapshot(prisma, 'flutterwave', currency, balance.availableBalance, balanceUsd);
      results.push({ provider: 'flutterwave', currency, balanceUsd });
    } catch (err) {
      errors.push({
        provider: `flutterwave:${balance.currency}`,
        message: (err as Error).message,
      });
    }
  }
}

async function pollNowPayments(
  nowPayments: NowPaymentsService,
  prisma: PrismaService,
  results: { provider: string; currency: string; balanceUsd: number }[],
  errors: { provider: string; message: string }[],
) {
  let balances: ProviderBalance[];
  try {
    balances = await nowPayments.getBalance();
  } catch (err) {
    errors.push({ provider: 'nowpayments', message: (err as Error).message });
    return;
  }

  for (const balance of balances) {
    try {
      const currency = balance.currency.toUpperCase();
      const balanceUsd = await toUsd(prisma, currency, balance.availableBalance);
      if (balanceUsd === null) continue;
      await upsertSnapshot(prisma, 'nowpayments', currency, balance.availableBalance, balanceUsd);
      results.push({ provider: 'nowpayments', currency, balanceUsd });
    } catch (err) {
      errors.push({
        provider: `nowpayments:${balance.currency}`,
        message: (err as Error).message,
      });
    }
  }
}

/**
 * Stablecoins/USD pass through 1:1. Everything else is fiat, converted via
 * Country.usdExchangeRate (units of that currency per 1 USD -- same field
 * fx-rate-job maintains). Returns null (skip this currency) rather than
 * throwing when no country carries this currencyCode, since an
 * unrecognized or not-yet-configured currency shouldn't block every other
 * balance in the same poll run.
 */
async function toUsd(
  prisma: PrismaService,
  currency: string,
  amount: number,
): Promise<number | null> {
  if (STABLECOIN_CURRENCIES.has(currency)) {
    return amount;
  }
  const country = await prisma.country.findFirst({
    where: { currencyCode: currency, usdExchangeRate: { not: null } },
    select: { usdExchangeRate: true },
  });
  if (!country?.usdExchangeRate) {
    return null;
  }
  return amount / country.usdExchangeRate.toNumber();
}

async function upsertSnapshot(
  prisma: PrismaService,
  provider: string,
  currency: string,
  balanceRaw: number,
  balanceUsd: number,
) {
  await prisma.reserveBalanceSnapshot.upsert({
    where: { provider_currency: { provider, currency } },
    update: {
      balanceRaw: new Prisma.Decimal(balanceRaw),
      balanceUsd: new Prisma.Decimal(balanceUsd),
      fetchedAt: new Date(),
    },
    create: {
      provider,
      currency,
      balanceRaw: new Prisma.Decimal(balanceRaw),
      balanceUsd: new Prisma.Decimal(balanceUsd),
    },
  });
}

bootstrap();
