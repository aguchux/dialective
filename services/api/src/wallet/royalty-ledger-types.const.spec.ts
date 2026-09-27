import { LedgerEntryType } from '@dialectiva/db';
import {
  ROYALTY_LEDGER_ENTRY_TYPES,
  isRoyaltyLedgerType,
} from './royalty-ledger-types.const';
import { LIFETIME_CREDIT_ENTRY_TYPES } from './trainer-report.service';

/**
 * Royalty entries live in the one LedgerEntry table, so every sum that
 * reconciles against Wallet.balance has to exclude them -- they never touched
 * that column. Section 6.1(c) of the revenue-sharing design names the two
 * places this matters; these tests pin the shared list those places filter on.
 */
describe('ROYALTY_LEDGER_ENTRY_TYPES', () => {
  it('lists every royalty type the schema defines, so none is silently summed', () => {
    // The failure mode this guards: a fifth royalty type added to the enum and
    // not to this list would silently rejoin the unfiltered totals.
    const fromSchema = Object.values(LedgerEntryType).filter((type) =>
      type.startsWith('ROYALTY_'),
    );

    expect([...ROYALTY_LEDGER_ENTRY_TYPES].sort()).toEqual([...fromSchema].sort());
  });

  it('contains only royalty types', () => {
    expect(ROYALTY_LEDGER_ENTRY_TYPES.every((type) => type.startsWith('ROYALTY_'))).toBe(
      true,
    );
  });

  it('identifies a royalty type and rejects an ordinary one', () => {
    expect(isRoyaltyLedgerType(LedgerEntryType.ROYALTY_ACCRUAL)).toBe(true);
    expect(isRoyaltyLedgerType(LedgerEntryType.TRAINING_PAYOUT)).toBe(false);
    expect(isRoyaltyLedgerType(LedgerEntryType.WITHDRAWAL_REVERSED)).toBe(false);
  });
});

describe('the lifetime-earnings allowlist', () => {
  it('excludes royalty accrual by construction', () => {
    // This is the pattern 6.1(c) singles out as safe: a new type is excluded
    // until someone deliberately adds it. It is why the proof-account
    // reconciliation narrative needed no change -- "total earned" is built from
    // an allowlist, so ROYALTY_ACCRUAL never entered it.
    const overlap = LIFETIME_CREDIT_ENTRY_TYPES.filter((type) =>
      isRoyaltyLedgerType(type),
    );

    expect(overlap).toEqual([]);
  });
});
