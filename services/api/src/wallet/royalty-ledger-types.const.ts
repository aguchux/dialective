import { LedgerEntryType } from '@dialectiva/db';

/**
 * Every ledger type that moves `Wallet.royaltyBalance` rather than
 * `Wallet.balance`.
 *
 * Royalty entries share the one LedgerEntry table deliberately -- one honest
 * record per wallet beats two places to look for the truth
 * (docs/Stream-Revenue-Sharing-Engine.md 6.2). The cost is that any sum which
 * reconciles against `Wallet.balance` must now exclude them, because they never
 * touched that column. Section 6.1(c) names the two places where an unfiltered
 * sum would otherwise inflate: the distributor sub-distributor totals and the
 * proof-account PDF.
 *
 * This is a denylist because those call sites sum EVERYTHING by default. The
 * allowlist pattern in trainer-report.service.ts is safer -- a new type is
 * excluded until someone adds it -- and is the one to prefer for anything new.
 * Where a denylist is unavoidable, it lives here so a fifth royalty type is one
 * edit rather than a hunt.
 */
export const ROYALTY_LEDGER_ENTRY_TYPES: LedgerEntryType[] = [
  LedgerEntryType.ROYALTY_ACCRUAL,
  LedgerEntryType.ROYALTY_WITHDRAWAL,
  LedgerEntryType.ROYALTY_WITHDRAWAL_REVERSED,
  LedgerEntryType.ROYALTY_ADJUSTMENT,
];

/** True when this entry moved royaltyBalance, not balance. */
export function isRoyaltyLedgerType(type: LedgerEntryType | string): boolean {
  return (ROYALTY_LEDGER_ENTRY_TYPES as string[]).includes(type);
}
