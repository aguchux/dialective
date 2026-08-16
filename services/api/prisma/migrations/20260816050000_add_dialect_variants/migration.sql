-- CreateTable
CREATE TABLE "dialect_variants" (
    "id" TEXT NOT NULL,
    "dialectId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialect_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dialect_variants_dialectId_idx" ON "dialect_variants"("dialectId");

-- CreateIndex
CREATE UNIQUE INDEX "dialect_variants_dialectId_tag_key" ON "dialect_variants"("dialectId", "tag");

-- AddForeignKey
ALTER TABLE "dialect_variants" ADD CONSTRAINT "dialect_variants_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "dialects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "dialectVariantId" TEXT;

-- AlterTable
ALTER TABLE "word_recordings" ADD COLUMN "dialectVariantId" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "dialectVariantId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_dialectVariantId_fkey" FOREIGN KEY ("dialectVariantId") REFERENCES "dialect_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_dialectVariantId_fkey" FOREIGN KEY ("dialectVariantId") REFERENCES "dialect_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_dialectVariantId_fkey" FOREIGN KEY ("dialectVariantId") REFERENCES "dialect_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
