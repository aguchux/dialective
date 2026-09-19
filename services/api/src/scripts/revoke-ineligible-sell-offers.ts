/**
 * One-off: cancel ACTIVE SELL offers whose owner no longer meets the
 * selling gate, returning their escrowed DL.
 *
 * Why a script and not SQL: cancelling a sell offer is three linked
 * writes -- unlock lockedBalance -> balance, write a P2P_ESCROW_REFUND
 * ledger entry, set the offer CANCELLED. Doing that by hand risks
 * stranding a member's tokens in lockedBalance where they are invisible
 * and unspendable, so this reuses the exact transaction P2PService uses
 * for an ordinary cancel.
 *
 * Scope is deliberately narrow: offers that have NEVER had a trade. An
 * offer with any trade row -- even a cancelled one -- has history a
 * counterparty saw, so it is left alone rather than rewritten underneath
 * them.
 *
 * Eligibility is re-evaluated here at execution time rather than trusting
 * a list prepared earlier: someone may have completed KYC since.
 *
 *   npx ts-node scripts/revoke-ineligible-sell-offers.ts          # dry run
 *   npx ts-node scripts/revoke-ineligible-sell-offers.ts --apply  # execute
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@dialectiva/db';
import { AppModule } from '../app.module';
import { MailService } from '../mail/mail.service';

// Same adapter construction as PrismaService -- Prisma 7 requires one.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes('--apply');

interface Candidate {
  id: string;
  userId: string;
  email: string;
  tokenAmount: Prisma.Decimal;
  phoneOk: boolean;
  kycOk: boolean;
  tasks: number;
}

async function minTasks(): Promise<number> {
  const row = await prisma.platformSettings.findFirst({
    select: { minCompletedTasksForWithdrawal: true },
  });
  const configured = row?.minCompletedTasksForWithdrawal;
  if (configured !== null && configured !== undefined) return configured;
  const raw = Number(process.env.MIN_COMPLETED_TASKS_FOR_WITHDRAWAL ?? '100');
  return Number.isFinite(raw) ? raw : 100;
}

/** Settled work, counted exactly as the withdrawal and P2P sell gates count it. */
async function settledTasks(userId: string): Promise<number> {
  const [words, conversations, validations] = await Promise.all([
    prisma.wordRecording.count({ where: { userId, status: 'SETTLED' } }),
    prisma.domainConversationRecording.count({ where: { userId, status: 'SETTLED' } }),
    prisma.wordValidation.count({ where: { validatorId: userId, status: 'SETTLED' } }),
  ]);
  return words + conversations + validations;
}

async function findCandidates(min: number): Promise<Candidate[]> {
  const offers = await prisma.p2PTokenOffer.findMany({
    where: {
      type: 'SELL',
      status: 'ACTIVE',
      // Never traded. Any trade row at all -- including a cancelled one --
      // means a counterparty engaged with these terms.
      trades: { none: {} },
    },
    select: {
      id: true,
      userId: true,
      tokenAmount: true,
      user: { select: { email: true, phoneVerifiedAt: true, kycStatus: true } },
    },
  });

  const out: Candidate[] = [];
  for (const offer of offers) {
    const tasks = await settledTasks(offer.userId);
    const phoneOk = offer.user.phoneVerifiedAt !== null;
    const kycOk = offer.user.kycStatus === 'APPROVED';
    if (phoneOk && kycOk && tasks >= min) continue; // still eligible -- leave it
    out.push({
      id: offer.id,
      userId: offer.userId,
      email: offer.user.email,
      tokenAmount: offer.tokenAmount,
      phoneOk,
      kycOk,
      tasks,
    });
  }
  return out;
}

function reasonFor(c: Candidate, min: number): string {
  const missing: string[] = [];
  if (!c.phoneOk) missing.push('no verified mobile');
  if (!c.kycOk) missing.push('KYC not approved');
  if (c.tasks < min) missing.push(`${c.tasks}/${min} tasks`);
  return missing.join(', ');
}

/** Phrased for the member rather than the operator running this. */
function missingForMember(c: Candidate, min: number): string {
  const missing: string[] = [];
  if (!c.phoneOk) missing.push('a verified mobile number');
  if (!c.kycOk) missing.push('approved identity verification');
  if (c.tasks < min) missing.push(`${min} completed tasks (you have ${c.tasks})`);
  return missing.join(', ');
}

/**
 * The same three writes P2PService.cancelSellOffer performs, in one
 * transaction. Re-checks status inside the transaction so an offer that
 * was accepted between listing and execution is skipped rather than
 * having its escrow pulled out from under a live trade.
 */
async function cancelOne(c: Candidate): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.p2PTokenOffer.findUnique({
      where: { id: c.id },
      include: { user: { include: { wallet: true } } },
    });
    if (!offer || offer.status !== 'ACTIVE' || offer.type !== 'SELL' || !offer.user.wallet) {
      return false;
    }
    const tradeCount = await tx.p2PTokenTrade.count({ where: { offerId: offer.id } });
    if (tradeCount > 0) return false;

    await tx.wallet.update({
      where: { id: offer.user.wallet.id },
      data: {
        lockedBalance: { decrement: offer.tokenAmount },
        balance: { increment: offer.tokenAmount },
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: offer.user.wallet.id,
        type: 'P2P_ESCROW_REFUND',
        amount: offer.tokenAmount,
        reference: offer.id,
      },
    });
    await tx.p2PTokenOffer.update({
      where: { id: offer.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    return true;
  });
}

async function main() {
  const min = await minTasks();
  const candidates = await findCandidates(min);
  const total = candidates.reduce(
    (sum, c) => sum.add(c.tokenAmount),
    new Prisma.Decimal(0),
  );

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} -- minimum tasks to sell: ${min}`);
  console.log(`offers: ${candidates.length}`);
  console.log(`sellers: ${new Set(candidates.map((c) => c.userId)).size}`);
  console.log(`DL to release from escrow: ${total.toString()}`);
  console.log('');
  for (const c of candidates.slice(0, 15)) {
    console.log(`  ${c.email}  ${c.tokenAmount.toString()} DL  (${reasonFor(c, min)})`);
  }
  if (candidates.length > 15) console.log(`  ... and ${candidates.length - 15} more`);

  if (!APPLY) {
    if (candidates[0]) {
      const sample = candidates[0];
      console.log('\n--- email each seller would receive (sample) ---');
      console.log(`To: ${sample.email}`);
      console.log('Subject: Your P2P sell offer was withdrawn -- your DL is back in your balance');
      console.log(
        `Missing: ${missingForMember(sample, min)}  |  Amount: ${sample.tokenAmount.toString()} DL`,
      );
    }
    console.log('\nNothing changed. Re-run with --apply to execute.');
    return;
  }

  // Booted only when applying, and only to reach MailService -- so the
  // notification goes through the same audited path production uses
  // rather than a second, divergent copy of the sending logic.
  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const mail = app.get(MailService);

  let cancelled = 0;
  let skipped = 0;
  let emailed = 0;
  let released = new Prisma.Decimal(0);
  // One transaction per offer, so a single failure cannot roll back the
  // unlocks that already succeeded.
  for (const c of candidates) {
    try {
      if (await cancelOne(c)) {
        cancelled += 1;
        released = released.add(c.tokenAmount);
        // AFTER the commit, never inside it: the DL is already back, and
        // a mail failure must not roll back the unlock it describes.
        try {
          await mail.sendP2PSellOfferWithdrawnEmail(
            c.email,
            c.tokenAmount.toString(),
            missingForMember(c, min),
          );
          emailed += 1;
        } catch (err) {
          console.log(`  EMAIL FAILED ${c.email} -- ${String(err)}`);
        }
      } else {
        skipped += 1;
        console.log(`  SKIPPED ${c.id} -- state changed since listing`);
      }
    } catch (err) {
      skipped += 1;
      console.log(`  FAILED ${c.id} -- ${String(err)}`);
    }
  }
  console.log(
    `\ncancelled=${cancelled} skipped=${skipped} emailed=${emailed} released=${released.toString()} DL`,
  );
  await app.close();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
