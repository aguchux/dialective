-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialects" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,

    CONSTRAINT "dialects_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "countryId" TEXT,
ADD COLUMN "dialectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dialects_tag_key" ON "dialects"("tag");

-- CreateIndex
CREATE INDEX "dialects_countryId_idx" ON "dialects"("countryId");

-- AddForeignKey
ALTER TABLE "dialects" ADD CONSTRAINT "dialects_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "dialects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
