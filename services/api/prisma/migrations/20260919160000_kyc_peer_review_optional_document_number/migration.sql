-- Some accepted ID documents carry no number at all.
--
-- The reviewer form required one, so a reviewer holding such a document
-- had to either invent a value or abandon the review. Both are worse than
-- recording honestly that there was nothing to read.
--
-- documentNumberMatched becomes nullable rather than defaulting to false,
-- because the three states are genuinely different evidence for the admin
-- who makes the final call:
--   true  -- a number was read and it matched the one on file
--   false -- a number was read and it did NOT match (a real red flag)
--   null  -- the document has no number to compare
-- Collapsing null into false would turn "nothing to check" into "failed
-- the check", which is exactly backwards.
--
-- Existing rows are untouched: every review submitted so far did supply a
-- number, so their true/false values remain meaningful as they stand.
ALTER TABLE "kyc_peer_reviews"
  ALTER COLUMN "documentNumberHash" DROP NOT NULL,
  ALTER COLUMN "documentNumberMatched" DROP NOT NULL;
