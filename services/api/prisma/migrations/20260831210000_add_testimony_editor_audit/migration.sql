ALTER TABLE "testimonies"
  ADD COLUMN "adminEditedAt" TIMESTAMP(3),
  ADD COLUMN "editedByAdminId" TEXT;

CREATE INDEX "testimonies_editedByAdminId_idx" ON "testimonies"("editedByAdminId");

ALTER TABLE "testimonies"
  ADD CONSTRAINT "testimonies_editedByAdminId_fkey"
  FOREIGN KEY ("editedByAdminId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
