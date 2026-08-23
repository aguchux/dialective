-- UserPaymentMethod gets a bankCode so bank selection can go through the
-- same Flutterwave-verified searchable picker used for payout accounts,
-- instead of a free-typed bank name. instructions moves off the per-account
-- row to a single global note on User (see p2pPaymentInstructions below) --
-- one P2P payment instruction per user, not per bank account.
ALTER TABLE "user_payment_methods" ADD COLUMN "bankCode" TEXT;
ALTER TABLE "user_payment_methods" DROP COLUMN "instructions";

ALTER TABLE "users" ADD COLUMN "p2pPaymentInstructions" TEXT;
