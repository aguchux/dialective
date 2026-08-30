-- Admins can hide an already-approved testimony from the public homepage
-- without reversing its approval or reward.
ALTER TABLE "testimonies" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;
