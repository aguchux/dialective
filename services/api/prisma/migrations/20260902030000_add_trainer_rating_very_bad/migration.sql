-- Adds a 5th trainer-rating tier below BAD, completing the 5-star ladder
-- (VERY_BAD=1 ... EXCELLENT=5). Purely additive -- existing BAD/GOOD/
-- VERY_GOOD/EXCELLENT rows and code are unaffected.
ALTER TYPE "TrainerRating" ADD VALUE 'VERY_BAD' BEFORE 'BAD';
