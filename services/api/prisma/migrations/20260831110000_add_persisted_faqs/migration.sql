-- Admin-authored public FAQ content. Initial rows preserve the pre-existing
-- frontend FAQ set so the public route remains populated after this migration.
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faqs_question_key" ON "faqs"("question");
CREATE INDEX "faqs_visible_sortOrder_idx" ON "faqs"("visible", "sortOrder");

ALTER TABLE "faqs" ADD CONSTRAINT "faqs_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "faqs" ("id", "question", "answer", "visible", "sortOrder", "createdAt", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000001', $faq$What is Dialect Library?$faq$, $faq$Dialect Library is a platform where trainers contribute voice recordings and word translations so speech AI can better understand underrepresented languages and dialects.$faq$, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', $faq$Who can become a trainer?$faq$, $faq$Anyone who can naturally speak one of the supported dialects can create an account and contribute. During onboarding you pick your country from the full list of African countries and then choose from that country's supported dialects.$faq$, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', $faq$What kind of tasks will I do?$faq$, $faq$There are two task types on the Training tab: word training (translate an English word into your dialect, or pronounce it, plus reverse-validating other trainers' translations back to English) and sentence dictation (record yourself reading a full prompt sentence aloud in your dialect).$faq$, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', $faq$Do I need AI experience?$faq$, $faq$No. You only need to speak the language or dialect naturally and follow the recording prompts clearly.$faq$, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', $faq$How are submissions scored?$faq$, $faq$Sentence-dictation recordings are transcribed automatically and then compared against other trainers who submitted the same prompt in your dialect (consensus scoring) -- more trainers active in your dialect means faster, more reliable scoring. Word-training translations are scored through peer reverse-validation, where another trainer transcribes your recording back to English. You can follow every submission's status on the Training tab, and see completed results with your accuracy score under My Scores.$faq$, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000006', $faq$What happens if my submission never gets scored?$faq$, $faq$Every submission has a scoring time limit. If it is not scored in time (for example, too few other trainers have submitted that prompt yet), it is automatically resolved -- either refunded, or, when enabled, paid out at a fair score anyway -- so you never lose your stake or your effort to low activity in your dialect.$faq$, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000007', $faq$How do I fund my account and what is DL?$faq$, $faq$DL (pronounced "dial") is Dialect Library's platform unit. Trainers top up their wallet with USDC or USDT through a secure hosted checkout. Your deposit is converted to DL at a fixed rate once the payment is confirmed, and your wallet balance updates automatically.$faq$, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000008', $faq$How do payouts and withdrawals work?$faq$, $faq$Dialect Library uses an internal DL ledger for every balance change. Once your balance reaches the minimum withdrawal threshold, you can request a withdrawal to a supported crypto currency and network from the Earnings tab. Your email must be verified first. An admin reviews and approves each request before it is paid out, and rejected or failed requests are automatically credited back to your wallet.$faq$, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000009', $faq$Why do I need to verify my email?$faq$, $faq$Email verification confirms you control a real, recoverable account before any withdrawal is processed. If your email is not verified yet, you will see a reminder banner on your dashboard and in your Profile with a one-click option to resend the verification link.$faq$, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000010', $faq$What is the referral program?$faq$, $faq$Every account gets a personal referral link, available on your dashboard. When someone you refer registers and later makes a confirmed DL deposit, you earn a commission on that deposit for as long as an active referral program is running. Referral rewards are not paid on registrations alone, only on confirmed funding.$faq$, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000011', $faq$How do I sign in?$faq$, $faq$You can create an account with an email and password, or use a passwordless magic link sent to your email. Both go through email verification.$faq$, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000012', $faq$Can I try the recording flow without logging in?$faq$, $faq$Yes. The pipeline test remains available so the upload and transcription flow can be tested without account setup.$faq$, true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("question") DO NOTHING;
