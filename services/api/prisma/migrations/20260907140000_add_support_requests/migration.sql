-- CreateTable
CREATE TABLE "support_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_requests_createdAt_idx" ON "support_requests"("createdAt");
CREATE INDEX "support_requests_email_idx" ON "support_requests"("email");
CREATE INDEX "support_requests_resolvedAt_idx" ON "support_requests"("resolvedAt");
CREATE INDEX "support_requests_resolvedByUserId_idx" ON "support_requests"("resolvedByUserId");

-- AddForeignKey
ALTER TABLE "support_requests"
ADD CONSTRAINT "support_requests_resolvedByUserId_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
