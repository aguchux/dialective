/**
 * One-off: settle verifications that already reached peer consensus before
 * consensus was allowed to decide on its own.
 *
 * Auto-decide fires when a review is SUBMITTED, so documents that hit the
 * count under the old admin-decides flow never trigger it -- they already
 * have enough reviews and no further one is coming. Without this they would
 * sit in the admin queue forever, flagged "needs an admin", which is the
 * exact backlog the change was meant to clear.
 *
 * Deliberately goes through KycPeerReviewService rather than SQL: the
 * decision has to carry the same status write, applicant notification,
 * reviewer payout and audit trail as any other. Writing statuses by hand
 * would leave reviewers unpaid and applicants untold.
 *
 * Idempotent: only picks up IN_REVIEW rows, and each decision moves the row
 * out of IN_REVIEW, so a second run finds nothing.
 *
 *   npx ts-node src/scripts/apply-pending-peer-consensus.ts          # dry run
 *   npx ts-node src/scripts/apply-pending-peer-consensus.ts --apply  # execute
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@dialectiva/db';
import { AppModule } from '../app.module';
import {
  INTEGRATION_SLUG,
  KYC_PEER_REVIEW_QUORUM,
  KycPeerReviewService,
} from '../kyc-peer-review/kyc-peer-review.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes('--apply');

interface Pending {
  id: string;
  email: string;
  approvals: number;
  declines: number;
  verdict: 'APPROVE' | 'DECLINE';
}

/** The live admin-owned count, so this settles on exactly today's rule. */
async function consensusCount(): Promise<number> {
  const integration = await prisma.integration.findUnique({
    where: { slug: INTEGRATION_SLUG },
    select: { consensusCount: true },
  });
  const configured = integration?.consensusCount;
  return configured !== undefined && configured !== null && configured >= 1
    ? configured
    : KYC_PEER_REVIEW_QUORUM;
}

async function findPending(consensus: number): Promise<Pending[]> {
  const rows = await prisma.kycVerification.findMany({
    where: { status: 'IN_REVIEW', peerReviews: { some: {} } },
    select: {
      id: true,
      user: { select: { email: true } },
      peerReviews: { select: { verdict: true } },
    },
  });

  const out: Pending[] = [];
  for (const row of rows) {
    const approvals = row.peerReviews.filter((r) => r.verdict === 'APPROVE').length;
    const declines = row.peerReviews.length - approvals;
    if (approvals < consensus && declines < consensus) continue;
    out.push({
      id: row.id,
      email: row.user.email,
      approvals,
      declines,
      verdict: approvals > declines ? 'APPROVE' : 'DECLINE',
    });
  }
  return out;
}

async function main() {
  const consensus = await consensusCount();
  const pending = await findPending(consensus);
  const approving = pending.filter((p) => p.verdict === 'APPROVE');
  const declining = pending.filter((p) => p.verdict === 'DECLINE');

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} -- consensus count: ${consensus}`);
  console.log(`verifications at consensus: ${pending.length}`);
  console.log(`  would APPROVE: ${approving.length}`);
  console.log(`  would DECLINE: ${declining.length}`);
  console.log('');
  for (const p of pending.slice(0, 10)) {
    console.log(`  ${p.email}  ${p.verdict}  (${p.approvals}-${p.declines})`);
  }
  if (pending.length > 10) console.log(`  ... and ${pending.length - 10} more`);

  if (!APPLY) {
    console.log('\nNothing changed. Re-run with --apply to execute.');
    return;
  }

  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const peerReview = app.get(KycPeerReviewService);

  let decided = 0;
  let failed = 0;
  for (const p of pending) {
    try {
      // The same entry point a submitted review uses, so these are settled
      // by exactly the code path that will settle every future one.
      // applyConsensusDecision swallows its own errors by design, so the
      // returned flag -- not the absence of a throw -- is what says it took.
      const { applied } = await peerReview.applyPendingConsensus(p.id);
      if (applied) {
        decided += 1;
        console.log(`  ${p.verdict} ${p.email}`);
      } else {
        failed += 1;
        console.log(`  DID NOT APPLY ${p.id} (${p.email}) -- still IN_REVIEW, see API logs`);
      }
    } catch (err) {
      failed += 1;
      console.log(`  FAILED ${p.id} (${p.email}) -- ${String(err)}`);
    }
  }
  console.log(`\ndecided=${decided} failed=${failed}`);
  await app.close();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // AppModule boots schedulers and queue consumers that app.close() does
    // not drain, so the process otherwise never exits.
    process.exit(process.exitCode ?? 0);
  });
