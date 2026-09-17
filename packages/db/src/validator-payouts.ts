import { Prisma, type PrismaClient } from './generated/prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Accepts either the top-level PrismaClient or a $transaction callback's
 * `tx` client (Prisma.TransactionClient, which omits $connect/$disconnect/
 * $on/$use/$extends) -- buildValidatorPayoutOps is meant to be called from
 * INSIDE ValidatorDecksService.publish()'s own $transaction (so the payout
 * ops land in the same atomic commit as the StreamDeck bridge + status
 * update), while creditValidatorPayout below manages its own transactions
 * per line and is typically called with the top-level client instead.
 */
type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

/**
 * Phase 3 of the Validator Dashboard (docs/validators.md, plan "Confirmed
 * product decisions" #6/#7): computes the full payout breakdown for
 * publishing one ValidatorDeck, and builds the idempotent LedgerEntry +
 * Wallet ops for it. Mirrors packages/db/src/payouts.ts's split between a
 * pure computation and an ops-building/executing pair (see
 * creditTrainingPayoutOps/buildCreditTrainingPayoutOps).
 *
 * Exact math (do not deviate without re-checking the plan):
 *  1. validCount = count of ValidatorDeckItem rows with
 *     validationStatus=VALID in the deck.
 *  2. rate = PlatformSettings.validationRewardPerRecording. If 0, every
 *     payee's amount is computed as 0 and the caller (publish()) skips all
 *     crediting -- the deck still publishes/bridges.
 *  3. base = validCount * rate.
 *  4. Creator share: reassignedFromUserId===null -> createdByUserId gets
 *     100% of base. reassignedFromUserId set -> reassignedFromUserId (the
 *     ORIGINAL owner) gets base * (100 - penalty) / 100, and the deck's
 *     CURRENT ownerUserId (the new owner) gets base * penalty / 100 --
 *     INSTEAD of the normal 100%-to-creator rule (these two entries
 *     replace, not add to, the creator's payout).
 *  5. Approval-chain bonuses: for every ValidatorDeckAuditLog row with
 *     action APPROVED or ADMIN_BYPASS_APPROVED, the row's fromStatus says
 *     which tier just approved (PENDING_L2 -> L2 bonus, PENDING_L3 -> L3
 *     bonus paid to that row's actorUserId; PENDING_ADMIN -> no bonus, an
 *     admin's own approval is never bonused). These are ADDITIVE on top of
 *     base, never deducted from anyone -- total payout can exceed 100% of
 *     base when multiple tiers approve.
 *  6. Every payee gets exactly one breakdown line per role with a stable,
 *     per-payee-unique reference (see buildReference below) so re-running
 *     publish (retry/re-invocation) can never double-pay -- creditOps below
 *     relies on the LedgerEntry(walletId, type, reference) unique
 *     constraint the same way creditTestimonyReward/creditStartupBonus do.
 */

export type ValidatorPayoutRole =
  'creator' | 'reassigned-owner' | 'l1-approver' | 'l2-approver' | 'l3-approver';

export interface ValidatorPayoutLine {
  userId: string;
  role: ValidatorPayoutRole;
  amount: Decimal;
  reference: string;
}

export interface ValidatorDeckAuditLogForPayout {
  action: 'APPROVED' | 'ADMIN_BYPASS_APPROVED' | string;
  actorUserId: string;
  fromStatus: string | null;
}

export interface ValidatorDeckForPayout {
  id: string;
  createdByUserId: string;
  ownerUserId: string;
  reassignedFromUserId: string | null;
  effectiveReassignmentPenaltyPercent: Decimal | number | string | null;
}

export interface ValidatorPayoutSettings {
  validationRewardPerRecording: Decimal | number | string;
  validatorL1ApprovalBonusPercent: Decimal | number | string;
  validatorL2ApprovalBonusPercent: Decimal | number | string;
  validatorL3ApprovalBonusPercent: Decimal | number | string;
}

export interface ValidatorPayoutBreakdown {
  deckId: string;
  validCount: number;
  rate: Decimal;
  base: Decimal;
  lines: ValidatorPayoutLine[];
  /** Sum of every line's amount -- total DL minted by this publish. */
  totalPayout: Decimal;
}

function buildReference(deckId: string, role: ValidatorPayoutRole, actorUserId?: string): string {
  if (role === 'creator') return `validator-deck:${deckId}:creator`;
  if (role === 'reassigned-owner') return `validator-deck:${deckId}:reassigned-owner`;
  // Approver bonuses are per-actor: PENDING_L2 and PENDING_L3 approvals
  // could in principle be logged for the same deck by different users
  // across a resubmission cycle (reject -> resubmit -> re-approve by a
  // DIFFERENT L2/L3 validator the second time), each of whom should be
  // paid their own bonus -- keying the reference by actorUserId (not just
  // "l2-approver") keeps those as separate, independently-idempotent lines
  // instead of colliding on a single shared reference.
  return `validator-deck:${deckId}:approver:${actorUserId}`;
}

/**
 * Pure computation -- no Prisma access, fully unit-testable. validCount is
 * passed in (not computed here) so callers that already loaded the deck's
 * items don't need to pass the whole item list through; auditLogs should be
 * every ValidatorDeckAuditLog row for this deck (any order, only APPROVED/
 * ADMIN_BYPASS_APPROVED rows are used).
 */
export function computeValidatorPayoutBreakdown(
  deck: ValidatorDeckForPayout,
  validCount: number,
  auditLogs: ValidatorDeckAuditLogForPayout[],
  settings: ValidatorPayoutSettings,
): ValidatorPayoutBreakdown {
  const rate = new Decimal(settings.validationRewardPerRecording);
  const base = rate.mul(validCount);

  const lines: ValidatorPayoutLine[] = [];

  if (base.gt(0)) {
    if (deck.reassignedFromUserId) {
      const penaltyPercent = new Decimal(deck.effectiveReassignmentPenaltyPercent ?? 0);
      const newOwnerAmount = base.mul(penaltyPercent).div(100);
      const originalOwnerAmount = base.sub(newOwnerAmount);
      if (originalOwnerAmount.gt(0)) {
        lines.push({
          userId: deck.reassignedFromUserId,
          role: 'creator',
          amount: originalOwnerAmount,
          reference: buildReference(deck.id, 'creator'),
        });
      }
      if (newOwnerAmount.gt(0)) {
        lines.push({
          userId: deck.ownerUserId,
          role: 'reassigned-owner',
          amount: newOwnerAmount,
          reference: buildReference(deck.id, 'reassigned-owner'),
        });
      }
    } else {
      lines.push({
        userId: deck.createdByUserId,
        role: 'creator',
        amount: base,
        reference: buildReference(deck.id, 'creator'),
      });
    }

    for (const log of auditLogs) {
      if (log.action !== 'APPROVED' && log.action !== 'ADMIN_BYPASS_APPROVED') continue;

      let role: ValidatorPayoutRole | null = null;
      let bonusPercent: Decimal | null = null;
      if (log.fromStatus === 'PENDING_L2') {
        role = 'l2-approver';
        bonusPercent = new Decimal(settings.validatorL2ApprovalBonusPercent);
      } else if (log.fromStatus === 'PENDING_L3') {
        role = 'l3-approver';
        bonusPercent = new Decimal(settings.validatorL3ApprovalBonusPercent);
      } else if (log.fromStatus === 'PENDING_ADMIN') {
        // Admin's own approval/publish gate is never bonused -- no line.
        continue;
      } else if ((log.fromStatus as string) === 'PENDING_L1') {
        // Dead branch: no ValidatorDeckStatus value currently routes a
        // deck to an L1 approver (the chain only ever produces
        // PENDING_L2/PENDING_L3/PENDING_ADMIN pending states -- see
        // ValidatorDecksService.nextPendingStatusForLevel). Kept here,
        // inert, to document the intended math per the plan's "L1-level
        // review bonus ... applies when an L1 validator is itself asked to
        // review/approve another party's work in an availability-gated
        // fallback scenario" -- if a future PENDING_L1 state is ever
        // introduced, this branch already computes its bonus correctly.
        role = 'l1-approver';
        bonusPercent = new Decimal(settings.validatorL1ApprovalBonusPercent);
      }

      if (!role || !bonusPercent) continue;
      const amount = base.mul(bonusPercent).div(100);
      if (!amount.gt(0)) continue;
      lines.push({
        userId: log.actorUserId,
        role,
        amount,
        reference: buildReference(deck.id, role, log.actorUserId),
      });
    }
  }

  const totalPayout = lines.reduce((sum, line) => sum.add(line.amount), new Decimal(0));

  return { deckId: deck.id, validCount, rate, base, lines, totalPayout };
}

/**
 * Builds (but does not execute) the Prisma ops that credit every payout
 * line -- one LedgerEntry(type=VALIDATION_REWARD) + one Wallet balance
 * increment per line, exactly like buildCreditTrainingPayoutOps. Every
 * line's reference is unique per (deck, payee-role[, actor]) so this is
 * safe to build and run again on a retried/duplicate publish() call: a
 * second run's LedgerEntry.create ops will violate the
 * (walletId, type, reference) unique constraint and the whole publish()
 * transaction rolls back rather than double-crediting -- callers that want
 * per-line idempotency instead of an all-or-nothing retry should use
 * creditValidatorPayout (below), which swallows P2002 per line.
 */
export async function buildValidatorPayoutOps(
  prisma: PrismaClientOrTx,
  breakdown: ValidatorPayoutBreakdown,
) {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const line of breakdown.lines) {
    const wallet = await getOrCreateWallet(prisma, line.userId);
    ops.push(
      prisma.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'VALIDATION_REWARD',
          amount: line.amount,
          reference: line.reference,
        },
      }),
    );
    ops.push(
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: line.amount } },
      }),
    );
  }
  return ops;
}

/**
 * Convenience wrapper for a caller that isn't already inside its own
 * $transaction (e.g. a one-off backfill/retry script) -- credits every
 * payout line in its own transaction per line, swallowing P2002 so a
 * partially-applied previous run can be safely re-run to completion.
 * publish() itself does NOT use this -- it calls buildValidatorPayoutOps
 * and folds the ops into its single deck-publish $transaction instead, so
 * the StreamDeck bridge + crediting + status update commit atomically.
 */
export async function creditValidatorPayout(
  prisma: PrismaClient,
  breakdown: ValidatorPayoutBreakdown,
): Promise<ValidatorPayoutLine[]> {
  const credited: ValidatorPayoutLine[] = [];
  for (const line of breakdown.lines) {
    const wallet = await getOrCreateWallet(prisma, line.userId);
    try {
      await prisma.$transaction([
        prisma.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: 'VALIDATION_REWARD',
            amount: line.amount,
            reference: line.reference,
          },
        }),
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: line.amount } },
        }),
      ]);
      credited.push(line);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        continue;
      }
      throw err;
    }
  }
  return credited;
}

async function getOrCreateWallet(prisma: PrismaClientOrTx, userId: string) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }
  try {
    return await prisma.wallet.create({ data: { userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.wallet.findUniqueOrThrow({ where: { userId } });
    }
    throw err;
  }
}
