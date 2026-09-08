import { computeValidatorPayoutBreakdown, Prisma, type ValidatorPayoutSettings } from '@dialectiva/db';

const { Decimal } = Prisma;

/**
 * Exercises packages/db/src/validator-payouts.ts's pure
 * computeValidatorPayoutBreakdown -- this is the money math for Phase 3
 * (docs/validators.md, plan "Confirmed product decisions" #6/#7), so it
 * gets the heaviest test coverage of anything in this phase: creator-only
 * base case, each approval-tier bonus present/absent, the reassignment
 * penalty split overriding the normal creator share, the zero-rate
 * disables-all-payout case, and per-payee reference uniqueness/stability
 * (the property buildValidatorPayoutOps relies on for idempotent republish
 * -- see payouts-course-completion.spec.ts for the DB-level idempotency
 * test of that same pattern applied to a different payout).
 */

const settings: ValidatorPayoutSettings = {
  validationRewardPerRecording: 2,
  validatorL1ApprovalBonusPercent: 5,
  validatorL2ApprovalBonusPercent: 10,
  validatorL3ApprovalBonusPercent: 15,
};

function deck(overrides: Partial<Parameters<typeof computeValidatorPayoutBreakdown>[0]> = {}) {
  return {
    id: 'deck-1',
    createdByUserId: 'creator-1',
    ownerUserId: 'creator-1',
    reassignedFromUserId: null,
    effectiveReassignmentPenaltyPercent: null,
    ...overrides,
  };
}

describe('computeValidatorPayoutBreakdown', () => {
  it('pays the creator 100% of base when no tier approved and no reassignment occurred', () => {
    const breakdown = computeValidatorPayoutBreakdown(deck(), 10, [], settings);

    expect(breakdown.validCount).toBe(10);
    expect(breakdown.rate.toString()).toBe('2');
    expect(breakdown.base.toString()).toBe('20');
    expect(breakdown.lines).toEqual([
      {
        userId: 'creator-1',
        role: 'creator',
        amount: expect.any(Decimal),
        reference: 'validator-deck:deck-1:creator',
      },
    ]);
    expect(breakdown.lines[0].amount.toString()).toBe('20');
    expect(breakdown.totalPayout.toString()).toBe('20');
  });

  it('adds the L2 approver bonus additively on top of the creator base', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [{ action: 'APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' }],
      settings,
    );

    // base = 20, L2 bonus = 20 * 10% = 2
    expect(breakdown.lines).toHaveLength(2);
    const creatorLine = breakdown.lines.find((l) => l.role === 'creator')!;
    const l2Line = breakdown.lines.find((l) => l.role === 'l2-approver')!;
    expect(creatorLine.amount.toString()).toBe('20');
    expect(l2Line.amount.toString()).toBe('2');
    expect(l2Line.userId).toBe('l2-user');
    expect(l2Line.reference).toBe('validator-deck:deck-1:approver:l2-user');
    expect(breakdown.totalPayout.toString()).toBe('22');
  });

  it('adds the L3 approver bonus additively, and both L2+L3 bonuses can stack past 100% of base', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [
        { action: 'APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' },
        { action: 'APPROVED', actorUserId: 'l3-user', fromStatus: 'PENDING_L3' },
      ],
      settings,
    );

    // base = 20; L2 bonus = 2 (10%); L3 bonus = 3 (15%); total = 25 (125% of base)
    expect(breakdown.lines).toHaveLength(3);
    const creatorLine = breakdown.lines.find((l) => l.role === 'creator')!;
    const l2Line = breakdown.lines.find((l) => l.role === 'l2-approver')!;
    const l3Line = breakdown.lines.find((l) => l.role === 'l3-approver')!;
    expect(creatorLine.amount.toString()).toBe('20');
    expect(l2Line.amount.toString()).toBe('2');
    expect(l3Line.amount.toString()).toBe('3');
    expect(breakdown.totalPayout.toString()).toBe('25');
  });

  it('ADMIN_BYPASS_APPROVED rows are bonused the same as APPROVED rows, keyed off fromStatus', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [{ action: 'ADMIN_BYPASS_APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' }],
      settings,
    );

    expect(breakdown.lines.find((l) => l.role === 'l2-approver')?.amount.toString()).toBe('2');
  });

  it('pays no bonus for a PENDING_ADMIN approval row -- an admin publish-gate approval is never bonused', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [{ action: 'APPROVED', actorUserId: 'admin-1', fromStatus: 'PENDING_ADMIN' }],
      settings,
    );

    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0].role).toBe('creator');
    expect(breakdown.totalPayout.toString()).toBe('20');
  });

  it('ignores audit rows whose action is not APPROVED/ADMIN_BYPASS_APPROVED (e.g. REJECTED, SUBMITTED)', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [
        { action: 'SUBMITTED', actorUserId: 'owner-1', fromStatus: 'DRAFT' },
        { action: 'REJECTED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' },
      ],
      settings,
    );

    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0].role).toBe('creator');
  });

  it('reassignment: splits base between the original owner (100-penalty%) and the new owner (penalty%), instead of the normal 100%-to-creator rule', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck({
        createdByUserId: 'creator-1',
        ownerUserId: 'new-owner-1',
        reassignedFromUserId: 'original-owner-1',
        effectiveReassignmentPenaltyPercent: 30,
      }),
      10,
      [],
      settings,
    );

    // base = 20; original owner gets 70% = 14; new owner gets 30% = 6
    expect(breakdown.lines).toHaveLength(2);
    const originalOwnerLine = breakdown.lines.find((l) => l.userId === 'original-owner-1')!;
    const newOwnerLine = breakdown.lines.find((l) => l.userId === 'new-owner-1')!;
    expect(originalOwnerLine.role).toBe('creator');
    expect(originalOwnerLine.amount.toString()).toBe('14');
    expect(originalOwnerLine.reference).toBe('validator-deck:deck-1:creator');
    expect(newOwnerLine.role).toBe('reassigned-owner');
    expect(newOwnerLine.amount.toString()).toBe('6');
    expect(newOwnerLine.reference).toBe('validator-deck:deck-1:reassigned-owner');
    expect(breakdown.totalPayout.toString()).toBe('20');
    // createdByUserId itself gets nothing when reassigned -- only the
    // reassignedFromUserId (original owner at reassignment time) and the
    // current owner are paid.
    expect(breakdown.lines.some((l) => l.userId === 'creator-1')).toBe(false);
  });

  it('reassignment combines with approval bonuses -- bonuses are unaffected by the reassignment split', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck({
        ownerUserId: 'new-owner-1',
        reassignedFromUserId: 'original-owner-1',
        effectiveReassignmentPenaltyPercent: 25,
      }),
      10,
      [{ action: 'APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' }],
      settings,
    );

    // base = 20; original owner 75% = 15; new owner 25% = 5; L2 bonus 10% = 2
    expect(breakdown.lines).toHaveLength(3);
    expect(breakdown.totalPayout.toString()).toBe('22');
  });

  it('a 100% reassignment penalty pays the new owner the entire base and nothing to the original owner', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck({
        ownerUserId: 'new-owner-1',
        reassignedFromUserId: 'original-owner-1',
        effectiveReassignmentPenaltyPercent: 100,
      }),
      10,
      [],
      settings,
    );

    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0]).toMatchObject({ userId: 'new-owner-1', role: 'reassigned-owner' });
    expect(breakdown.lines[0].amount.toString()).toBe('20');
  });

  it('a 0% reassignment penalty pays the original owner the entire base and nothing to the new owner', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck({
        ownerUserId: 'new-owner-1',
        reassignedFromUserId: 'original-owner-1',
        effectiveReassignmentPenaltyPercent: 0,
      }),
      10,
      [],
      settings,
    );

    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0]).toMatchObject({ userId: 'original-owner-1', role: 'creator' });
    expect(breakdown.lines[0].amount.toString()).toBe('20');
  });

  it('a null effectiveReassignmentPenaltyPercent on a reassigned deck is treated as 0 (defensive default, should not happen in practice since reassign() always sets it)', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck({
        ownerUserId: 'new-owner-1',
        reassignedFromUserId: 'original-owner-1',
        effectiveReassignmentPenaltyPercent: null,
      }),
      10,
      [],
      settings,
    );

    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.lines[0]).toMatchObject({ userId: 'original-owner-1', amount: expect.any(Decimal) });
    expect(breakdown.lines[0].amount.toString()).toBe('20');
  });

  it('zero rate disables all crediting -- base is 0 and no lines are produced, even with approvals/reassignment present', () => {
    const zeroRateSettings: ValidatorPayoutSettings = { ...settings, validationRewardPerRecording: 0 };
    const breakdown = computeValidatorPayoutBreakdown(
      deck({
        ownerUserId: 'new-owner-1',
        reassignedFromUserId: 'original-owner-1',
        effectiveReassignmentPenaltyPercent: 50,
      }),
      10,
      [{ action: 'APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' }],
      zeroRateSettings,
    );

    expect(breakdown.base.toString()).toBe('0');
    expect(breakdown.lines).toEqual([]);
    expect(breakdown.totalPayout.toString()).toBe('0');
  });

  it('zero validCount also produces zero base and no lines, even with a nonzero rate', () => {
    const breakdown = computeValidatorPayoutBreakdown(deck(), 0, [], settings);

    expect(breakdown.base.toString()).toBe('0');
    expect(breakdown.lines).toEqual([]);
  });

  it('every line has a distinct, stable reference -- the property that makes republish idempotent', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [
        { action: 'APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' },
        { action: 'APPROVED', actorUserId: 'l3-user', fromStatus: 'PENDING_L3' },
      ],
      settings,
    );

    const references = breakdown.lines.map((l) => l.reference);
    expect(new Set(references).size).toBe(references.length);

    // Recomputing from the same inputs must produce byte-identical
    // references -- this is what lets a retried publish() rebuild the exact
    // same LedgerEntry.reference values and collide safely on the unique
    // constraint instead of minting a second payout.
    const secondPass = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [
        { action: 'APPROVED', actorUserId: 'l2-user', fromStatus: 'PENDING_L2' },
        { action: 'APPROVED', actorUserId: 'l3-user', fromStatus: 'PENDING_L3' },
      ],
      settings,
    );
    expect(secondPass.lines.map((l) => l.reference)).toEqual(references);
  });

  it('two different approvers at the same tier across a reject/resubmit cycle each get their own bonus line, keyed by actorUserId', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [
        { action: 'APPROVED', actorUserId: 'l2-user-a', fromStatus: 'PENDING_L2' },
        { action: 'APPROVED', actorUserId: 'l2-user-b', fromStatus: 'PENDING_L2' },
      ],
      settings,
    );

    // Both are paid -- computeValidatorPayoutBreakdown pays every qualifying
    // audit row, it does not deduplicate by role. (A real resubmission cycle
    // would only ever produce one PENDING_L2 APPROVED row per successful
    // pass through that tier in practice, but the pure function itself
    // doesn't assume that -- deduplication, if ever needed, is a policy
    // decision for the caller, not this computation.)
    expect(breakdown.lines.filter((l) => l.role === 'l2-approver')).toHaveLength(2);
    expect(breakdown.lines.find((l) => l.userId === 'l2-user-a')?.reference).toBe(
      'validator-deck:deck-1:approver:l2-user-a',
    );
    expect(breakdown.lines.find((l) => l.userId === 'l2-user-b')?.reference).toBe(
      'validator-deck:deck-1:approver:l2-user-b',
    );
  });

  it('the dead PENDING_L1 branch computes the L1 bonus correctly if it were ever reachable (documented intent, not currently produced by the real state machine)', () => {
    const breakdown = computeValidatorPayoutBreakdown(
      deck(),
      10,
      [{ action: 'APPROVED', actorUserId: 'l1-user', fromStatus: 'PENDING_L1' }],
      settings,
    );

    const l1Line = breakdown.lines.find((l) => l.role === 'l1-approver');
    expect(l1Line?.amount.toString()).toBe('1'); // 20 * 5%
    expect(l1Line?.reference).toBe('validator-deck:deck-1:approver:l1-user');
  });
});
