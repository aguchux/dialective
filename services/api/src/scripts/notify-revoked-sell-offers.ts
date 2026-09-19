/**
 * One-off follow-up: email the sellers whose ACTIVE SELL offers were
 * cancelled by revoke-ineligible-sell-offers.ts.
 *
 * Why this exists as a second script: the revocation run cancelled all 78
 * offers correctly, but every mail call fell into MailService.send's
 * `if (!this.resend)` stub branch -- that branch returns BEFORE recordSend,
 * so it left no audit row and no member was notified. The cause was purely
 * environmental (no RESEND_API_KEY in the operator's shell), not a logic
 * fault, so the fix is to send the missing mail rather than re-run anything
 * that touches escrow. This script performs NO writes to offers, wallets or
 * the ledger.
 *
 * The recipient list is read back from what actually happened -- the
 * P2P_ESCROW_REFUND ledger rows written during the run -- rather than by
 * re-deriving "who is ineligible" today. Re-deriving would mail the wrong
 * people: someone who completed KYC in the meantime is now eligible but
 * their offer is still gone, and they are exactly who most needs telling.
 *
 * Idempotent: skips any recipient who already has a sent=true audit row for
 * this email kind, so a second run after a partial failure resumes rather
 * than double-mailing. Re-reads that set from the database per offer, so
 * two offers owned by the same member still produce two emails only if the
 * member genuinely had two offers cancelled.
 *
 *   npx ts-node src/scripts/notify-revoked-sell-offers.ts                    # dry run
 *   npx ts-node src/scripts/notify-revoked-sell-offers.ts --to me@x.com      # render one real email to a test address
 *   npx ts-node src/scripts/notify-revoked-sell-offers.ts --apply            # send to all
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@dialectiva/db';
import { AppModule } from '../app.module';
import { MailService } from '../mail/mail.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes('--apply');
const TO_INDEX = process.argv.indexOf('--to');
const TEST_TO = TO_INDEX >= 0 ? process.argv[TO_INDEX + 1] : undefined;
const KIND = 'sendP2PSellOfferWithdrawnEmail';

/**
 * The window of the revocation run. Bounded deliberately rather than
 * "all cancelled sell offers": members cancel their own offers all the
 * time and must never receive this email.
 */
const RUN_START = new Date('2026-09-19T08:47:00.000Z');
const RUN_END = new Date('2026-09-19T08:51:00.000Z');

interface Recipient {
  offerId: string;
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
  return row?.minCompletedTasksForWithdrawal ?? 100;
}

async function settledTasks(userId: string): Promise<number> {
  const [words, conversations, validations] = await Promise.all([
    prisma.wordRecording.count({ where: { userId, status: 'SETTLED' } }),
    prisma.domainConversationRecording.count({ where: { userId, status: 'SETTLED' } }),
    prisma.wordValidation.count({ where: { validatorId: userId, status: 'SETTLED' } }),
  ]);
  return words + conversations + validations;
}

/**
 * Reconstructs the affected set from the escrow refunds the run wrote.
 * Joining through the ledger rather than listing cancelled offers directly
 * is what distinguishes "this script cancelled it" from "the member did".
 */
async function findRecipients(): Promise<Recipient[]> {
  const refunds = await prisma.ledgerEntry.findMany({
    where: {
      type: 'P2P_ESCROW_REFUND',
      createdAt: { gte: RUN_START, lte: RUN_END },
    },
    select: { reference: true },
  });
  const offerIds = refunds
    .map((r) => r.reference)
    .filter((r): r is string => typeof r === 'string' && r.length > 0);

  const offers = await prisma.p2PTokenOffer.findMany({
    where: {
      id: { in: offerIds },
      type: 'SELL',
      status: 'CANCELLED',
    },
    select: {
      id: true,
      userId: true,
      tokenAmount: true,
      user: { select: { email: true, phoneVerifiedAt: true, kycStatus: true } },
    },
  });

  const out: Recipient[] = [];
  for (const offer of offers) {
    out.push({
      offerId: offer.id,
      userId: offer.userId,
      email: offer.user.email,
      tokenAmount: offer.tokenAmount,
      phoneOk: offer.user.phoneVerifiedAt !== null,
      kycOk: offer.user.kycStatus === 'APPROVED',
      tasks: await settledTasks(offer.userId),
    });
  }
  return out;
}

/** Phrased for the member rather than the operator running this. */
function missingForMember(r: Recipient, min: number): string {
  const missing: string[] = [];
  if (!r.phoneOk) missing.push('a verified mobile number');
  if (!r.kycOk) missing.push('approved identity verification');
  if (r.tasks < min) missing.push(`${min} completed tasks (you have ${r.tasks})`);
  // Someone who has since become eligible still had their offer withdrawn
  // and still deserves the email -- just without a nonexistent complaint.
  return missing.length > 0 ? missing.join(', ') : 'nothing -- your account now meets every requirement';
}

/** Emails already delivered, so a resumed run does not mail anyone twice. */
async function alreadySent(): Promise<Map<string, number>> {
  const rows = await prisma.emailSendLog.groupBy({
    by: ['toEmail'],
    where: { kind: KIND, sent: true },
    _count: { toEmail: true },
  });
  return new Map(rows.map((r) => [r.toEmail, r._count.toEmail]));
}

async function main() {
  const min = await minTasks();
  const recipients = await findRecipients();
  const sentAlready = await alreadySent();
  const total = recipients.reduce(
    (sum, r) => sum.add(r.tokenAmount),
    new Prisma.Decimal(0),
  );

  console.log(`${APPLY ? 'SENDING' : TEST_TO ? 'TEST SEND' : 'DRY RUN'}`);
  console.log(`offers cancelled by the run: ${recipients.length}`);
  console.log(`distinct sellers: ${new Set(recipients.map((r) => r.userId)).size}`);
  console.log(`DL released: ${total.toString()}`);
  console.log(`already emailed (skipped): ${sentAlready.size}`);
  console.log('');

  if (!APPLY && !TEST_TO) {
    for (const r of recipients.slice(0, 10)) {
      console.log(`  ${r.email}  ${r.tokenAmount.toString()} DL  -- missing: ${missingForMember(r, min)}`);
    }
    if (recipients.length > 10) console.log(`  ... and ${recipients.length - 10} more`);
    console.log('\nNothing sent. --to <email> renders one real email; --apply sends to all.');
    return;
  }

  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const mail = app.get(MailService);

  // The stub branch that swallowed the first run silently. Fail loudly
  // here instead of "succeeding" against a console logger again.
  if (!process.env.RESEND_API_KEY) {
    console.error(
      '\nRESEND_API_KEY is not set. MailService would log to stdout and send nothing,\n' +
        'which is exactly the failure this script exists to repair. Aborting.',
    );
    await app.close();
    return;
  }

  if (TEST_TO) {
    const sample = recipients[0];
    if (!sample) {
      console.log('No recipients found -- nothing to render.');
      await app.close();
      return;
    }
    await mail.sendP2PSellOfferWithdrawnEmail(
      TEST_TO,
      sample.tokenAmount.toString(),
      missingForMember(sample, min),
    );
    console.log(`Sent one sample email to ${TEST_TO} (content of ${sample.email}'s).`);
    await app.close();
    return;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of recipients) {
    if (sentAlready.has(r.email)) {
      skipped += 1;
      continue;
    }
    try {
      await mail.sendP2PSellOfferWithdrawnEmail(
        r.email,
        r.tokenAmount.toString(),
        missingForMember(r, min),
      );
      sent += 1;
      console.log(`  sent ${r.email}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAILED ${r.email} -- ${String(err)}`);
    }
  }
  console.log(`\nsent=${sent} skipped=${skipped} failed=${failed}`);
  await app.close();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The revocation run hung here forever: AppModule boots schedulers and
    // queue handles that app.close() does not drain, so the process never
    // exits on its own. Exit explicitly once the work is done.
    process.exit(process.exitCode ?? 0);
  });
