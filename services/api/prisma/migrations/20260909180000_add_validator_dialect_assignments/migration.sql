-- CreateTable
CREATE TABLE "validator_dialect_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dialectId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validator_dialect_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "validator_dialect_assignments_userId_dialectId_key" ON "validator_dialect_assignments"("userId", "dialectId");
CREATE INDEX "validator_dialect_assignments_dialectId_idx" ON "validator_dialect_assignments"("dialectId");

-- AddForeignKey
ALTER TABLE "validator_dialect_assignments"
ADD CONSTRAINT "validator_dialect_assignments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "validator_dialect_assignments"
ADD CONSTRAINT "validator_dialect_assignments_dialectId_fkey"
FOREIGN KEY ("dialectId") REFERENCES "dialects"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validator_dialect_assignments"
ADD CONSTRAINT "validator_dialect_assignments_assignedById_fkey"
FOREIGN KEY ("assignedById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "validator_decks" ADD COLUMN "dialectId" TEXT;
ALTER TABLE "validator_decks" ADD COLUMN "dialectVariantId" TEXT;

-- AddForeignKey
ALTER TABLE "validator_decks"
ADD CONSTRAINT "validator_decks_dialectId_fkey"
FOREIGN KEY ("dialectId") REFERENCES "dialects"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validator_decks"
ADD CONSTRAINT "validator_decks_dialectVariantId_fkey"
FOREIGN KEY ("dialectVariantId") REFERENCES "dialect_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
