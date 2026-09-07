-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'CLOSED';

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'ACCOUNT_CLOSE';

-- AlterTable
-- Login 2FA channel toggles, both off by default -- every login previously
-- unconditionally emailed an OTP, which was spamming the transactional mail
-- system. Login becomes password-only unless a user explicitly opts in.
ALTER TABLE "users" ADD COLUMN "twoFactorEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "twoFactorSmsEnabled" BOOLEAN NOT NULL DEFAULT false;
