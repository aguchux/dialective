-- CreateEnum
CREATE TYPE "ReferralInviteStatus" AS ENUM ('INVITED', 'JOINED');

-- CreateTable
CREATE TABLE "referral_invites" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "status" "ReferralInviteStatus" NOT NULL DEFAULT 'INVITED',
    "joinedUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_invites_email_idx" ON "referral_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "referral_invites_inviterId_email_key" ON "referral_invites"("inviterId", "email");

-- AddForeignKey
ALTER TABLE "referral_invites" ADD CONSTRAINT "referral_invites_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_invites" ADD CONSTRAINT "referral_invites_joinedUserId_fkey" FOREIGN KEY ("joinedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
