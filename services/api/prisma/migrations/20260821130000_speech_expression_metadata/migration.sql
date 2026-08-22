-- CreateEnum
CREATE TYPE "SpeechEmotion" AS ENUM ('NEUTRAL', 'HAPPY', 'SAD', 'ANGRY', 'FEARFUL', 'SURPRISED', 'DISGUSTED');

-- CreateEnum
CREATE TYPE "SpeechTone" AS ENUM ('FORMAL', 'CASUAL', 'EMPHATIC', 'FLAT');

-- CreateEnum
CREATE TYPE "SpeechStyle" AS ENUM ('CONVERSATIONAL', 'READ_ALOUD', 'EXPRESSIVE');

-- CreateEnum
CREATE TYPE "SpeechSpeed" AS ENUM ('SLOW', 'NORMAL', 'FAST');

-- CreateEnum
CREATE TYPE "SpeechEnergy" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "emotion" "SpeechEmotion";
ALTER TABLE "submissions" ADD COLUMN "emotionConfidence" DECIMAL(5,4);
ALTER TABLE "submissions" ADD COLUMN "tone" "SpeechTone";
ALTER TABLE "submissions" ADD COLUMN "style" "SpeechStyle";
ALTER TABLE "submissions" ADD COLUMN "speed" "SpeechSpeed";
ALTER TABLE "submissions" ADD COLUMN "energy" "SpeechEnergy";
ALTER TABLE "submissions" ADD COLUMN "prosodyMetrics" JSONB;
ALTER TABLE "submissions" ADD COLUMN "expressionCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "word_recordings" ADD COLUMN "emotion" "SpeechEmotion";
ALTER TABLE "word_recordings" ADD COLUMN "emotionConfidence" DECIMAL(5,4);
ALTER TABLE "word_recordings" ADD COLUMN "tone" "SpeechTone";
ALTER TABLE "word_recordings" ADD COLUMN "style" "SpeechStyle";
ALTER TABLE "word_recordings" ADD COLUMN "speed" "SpeechSpeed";
ALTER TABLE "word_recordings" ADD COLUMN "energy" "SpeechEnergy";
ALTER TABLE "word_recordings" ADD COLUMN "prosodyMetrics" JSONB;
ALTER TABLE "word_recordings" ADD COLUMN "expressionCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "speechExpressionEnabled" BOOLEAN NOT NULL DEFAULT false;
